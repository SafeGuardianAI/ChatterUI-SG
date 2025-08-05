#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔨 Building LLguidance for Android...');

const LLGUIDANCE_DIR = path.join(__dirname, '..', 'ChatterUI-SG', 'llguidance-bg');
const ANDROID_LIBS_DIR = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'jniLibs');

// Target architectures for Android
const ANDROID_TARGETS = [
    { rust: 'aarch64-linux-android', android: 'arm64-v8a' },
    { rust: 'armv7-linux-androideabi', android: 'armeabi-v7a' },
    { rust: 'i686-linux-android', android: 'x86' },
    { rust: 'x86_64-linux-android', android: 'x86_64' }
];

function runCommand(command, options = {}) {
    console.log(`📦 Running: ${command}`);
    try {
        execSync(command, { stdio: 'inherit', ...options });
    } catch (error) {
        console.error(`❌ Command failed: ${command}`);
        process.exit(1);
    }
}

function ensureDirectoryExists(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
    }
}

async function main() {
    // Check for Android NDK
    const ndkRoot = process.env.ANDROID_NDK_ROOT || process.env.NDK_ROOT || process.env.ANDROID_NDK_HOME;
    if (!ndkRoot) {
        console.error('❌ Android NDK not found!');
        console.log('💡 Please install Android NDK and set environment variable:');
        console.log('   export ANDROID_NDK_ROOT=/path/to/android-ndk');
        console.log('   or install via Android Studio SDK Manager');
        process.exit(1);
    }

    console.log(`📦 Using Android NDK: ${ndkRoot}`);

    // Ensure llguidance directory exists
    if (!fs.existsSync(LLGUIDANCE_DIR)) {
        console.error(`❌ LLguidance directory not found: ${LLGUIDANCE_DIR}`);
        console.log('Please ensure ChatterUI-SG/llguidance-bg exists and contains the Rust library');
        process.exit(1);
    }

    // Change to llguidance directory
    process.chdir(LLGUIDANCE_DIR);

    // Set up Android environment variables for cross-compilation
    console.log('🔧 Configuring cross-compilation environment...');
    
    let toolchainDir, scriptExt;
    if (process.platform === 'win32') {
        toolchainDir = path.join(ndkRoot, 'toolchains', 'llvm', 'prebuilt', 'windows-x86_64', 'bin');
        scriptExt = '.cmd'; // Use .cmd files on Windows
    } else if (process.platform === 'darwin') {
        toolchainDir = path.join(ndkRoot, 'toolchains', 'llvm', 'prebuilt', 'darwin-x86_64', 'bin');
        scriptExt = '';
    } else {
        toolchainDir = path.join(ndkRoot, 'toolchains', 'llvm', 'prebuilt', 'linux-x86_64', 'bin');
        scriptExt = '';
    }

    // Check if toolchain directory exists
    if (!fs.existsSync(toolchainDir)) {
        console.error(`❌ NDK toolchain not found: ${toolchainDir}`);
        console.log('💡 Please ensure Android NDK is properly installed');
        process.exit(1);
    }

    // Set cross-compilation environment variables
    const apiLevel = '21'; // Minimum Android API level
    process.env.CC_aarch64_linux_android = path.join(toolchainDir, `aarch64-linux-android${apiLevel}-clang${scriptExt}`);
    process.env.CC_armv7_linux_androideabi = path.join(toolchainDir, `armv7a-linux-androideabi${apiLevel}-clang${scriptExt}`);
    process.env.CC_i686_linux_android = path.join(toolchainDir, `i686-linux-android${apiLevel}-clang${scriptExt}`);
    process.env.CC_x86_64_linux_android = path.join(toolchainDir, `x86_64-linux-android${apiLevel}-clang${scriptExt}`);
    
    // Set AR (archiver) environment variables
    process.env.AR_aarch64_linux_android = path.join(toolchainDir, `llvm-ar.exe`); // llvm-ar is .exe
    process.env.AR_armv7_linux_androideabi = path.join(toolchainDir, `llvm-ar.exe`);
    process.env.AR_i686_linux_android = path.join(toolchainDir, `llvm-ar.exe`);
    process.env.AR_x86_64_linux_android = path.join(toolchainDir, `llvm-ar.exe`);
    
    // Set CARGO_TARGET environment variables for linker
    process.env.CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = process.env.CC_aarch64_linux_android;
    process.env.CARGO_TARGET_ARMV7_LINUX_ANDROIDEABI_LINKER = process.env.CC_armv7_linux_androideabi;
    process.env.CARGO_TARGET_I686_LINUX_ANDROID_LINKER = process.env.CC_i686_linux_android;
    process.env.CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER = process.env.CC_x86_64_linux_android;

    // Verify compilers exist
    for (const target of ANDROID_TARGETS) {
        const compilerVar = `CC_${target.rust.replace(/-/g, '_')}`;
        const compilerPath = process.env[compilerVar];
        if (!fs.existsSync(compilerPath)) {
            console.error(`❌ Compiler not found: ${compilerPath}`);
            console.log(`💡 Expected for target: ${target.rust}`);
            console.log(`💡 Variable name: ${compilerVar}`);
            console.log(`💡 Variable value: ${compilerPath}`);
            process.exit(1);
        }
        console.log(`✅ Found compiler for ${target.android}: ${path.basename(compilerPath)}`);
    }

    // Install Android targets if not already installed
    console.log('🎯 Installing Android targets...');
    for (const target of ANDROID_TARGETS) {
        runCommand(`rustup target add ${target.rust}`);
    }

    // Build for each Android target
    for (const target of ANDROID_TARGETS) {
        console.log(`🔨 Building for ${target.android} (${target.rust})...`);
        
        // Build the library
        runCommand(`cargo build --release --target ${target.rust}`);
        
        // Create target directory
        const targetDir = path.join(ANDROID_LIBS_DIR, target.android);
        ensureDirectoryExists(targetDir);
        
        // Copy the compiled library
        const libSource = path.join(LLGUIDANCE_DIR, 'target', target.rust, 'release', 'libllguidance_bg.so');
        const libDest = path.join(targetDir, 'libllguidance_bg.so');
        
        if (fs.existsSync(libSource)) {
            fs.copyFileSync(libSource, libDest);
            console.log(`✅ Copied ${target.android} library to ${libDest}`);
        } else {
            console.error(`❌ Library not found: ${libSource}`);
            process.exit(1);
        }
    }

    // Copy header files
    const cppDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'cpp');
    ensureDirectoryExists(cppDir);
    
    const headerSource = path.join(LLGUIDANCE_DIR, 'cpp', 'llguidance_bg_cpp.h');
    const headerDest = path.join(cppDir, 'llguidance_bg_cpp.h');
    
    if (fs.existsSync(headerSource)) {
        fs.copyFileSync(headerSource, headerDest);
        console.log(`✅ Copied header to ${headerDest}`);
    } else {
        console.warn(`⚠️  Header not found: ${headerSource}`);
    }

    console.log('🎉 LLguidance Android build completed successfully!');
    console.log('📱 You can now build the Android app with: cd android && ./gradlew assembleDebug');
}

main().catch(error => {
    console.error('❌ Build failed:', error);
    process.exit(1);
});