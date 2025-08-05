#!/usr/bin/env node

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const rustProjectPath = path.join(projectRoot, 'ChatterUI-SG', 'llguidance-bg')
const jniLibsPath = path.join(projectRoot, 'assets', 'jniLibs')

// Target architectures for Android
const targets = [
    { rustTarget: 'armv7-linux-androideabi', androidAbi: 'armeabi-v7a' },
    { rustTarget: 'aarch64-linux-android', androidAbi: 'arm64-v8a' },
    { rustTarget: 'i686-linux-android', androidAbi: 'x86' },
    { rustTarget: 'x86_64-linux-android', androidAbi: 'x86_64' }
]

console.log('🦀 Building LLguidance native module...')

// Check if Rust is installed
try {
    execSync('rustc --version', { stdio: 'pipe' })
    console.log('✅ Rust found')
} catch (error) {
    console.error('❌ Rust not found. Please install Rust: https://rustup.rs/')
    process.exit(1)
}

// Check if Android targets are installed
console.log('📱 Checking Android targets...')
targets.forEach(({ rustTarget }) => {
    try {
        execSync(`rustup target list --installed | grep ${rustTarget}`, { stdio: 'pipe' })
        console.log(`✅ ${rustTarget} target installed`)
    } catch (error) {
        console.log(`📦 Installing ${rustTarget} target...`)
        try {
            execSync(`rustup target add ${rustTarget}`, { stdio: 'inherit' })
            console.log(`✅ ${rustTarget} target installed`)
        } catch (installError) {
            console.error(`❌ Failed to install ${rustTarget}:`, installError.message)
            process.exit(1)
        }
    }
})

// Create JNI libs directories
console.log('📁 Creating JNI library directories...')
targets.forEach(({ androidAbi }) => {
    const targetDir = path.join(jniLibsPath, androidAbi)
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
        console.log(`✅ Created directory: ${targetDir}`)
    }
})

// Set up Android NDK environment
console.log('🔧 Setting up Android NDK environment...')
const androidNdk = process.env.ANDROID_NDK_ROOT || process.env.NDK_HOME
if (!androidNdk) {
    console.error('❌ ANDROID_NDK_ROOT or NDK_HOME environment variable not set')
    console.error('Please set it to your Android NDK path, e.g.:')
    console.error('export ANDROID_NDK_ROOT=/path/to/android-ndk')
    process.exit(1)
}

console.log(`✅ Using Android NDK: ${androidNdk}`)

// Build for each target
console.log('🔨 Building for all target architectures...')
targets.forEach(({ rustTarget, androidAbi }) => {
    console.log(`\n📱 Building for ${androidAbi} (${rustTarget})...`)
    
    try {
        // Set up cross-compilation environment
        const env = {
            ...process.env,
            TARGET: rustTarget,
            AR: `${androidNdk}/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-ar`,
            CC: `${androidNdk}/toolchains/llvm/prebuilt/linux-x86_64/bin/${getClangTarget(rustTarget)}21-clang`,
            CXX: `${androidNdk}/toolchains/llvm/prebuilt/linux-x86_64/bin/${getClangTarget(rustTarget)}21-clang++`,
            CARGO_TARGET_ARMV7_LINUX_ANDROIDEABI_LINKER: `${androidNdk}/toolchains/llvm/prebuilt/linux-x86_64/bin/armv7a-linux-androideabi21-clang`,
            CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER: `${androidNdk}/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android21-clang`,
            CARGO_TARGET_I686_LINUX_ANDROID_LINKER: `${androidNdk}/toolchains/llvm/prebuilt/linux-x86_64/bin/i686-linux-android21-clang`,
            CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER: `${androidNdk}/toolchains/llvm/prebuilt/linux-x86_64/bin/x86_64-linux-android21-clang`
        }
        
        // Build the Rust library
        execSync(`cargo build --release --target ${rustTarget}`, {
            cwd: rustProjectPath,
            stdio: 'inherit',
            env
        })
        
        // Copy the library to JNI libs
        const sourceLib = path.join(rustProjectPath, 'target', rustTarget, 'release', 'libllguidance_bg.a')
        const targetLib = path.join(jniLibsPath, androidAbi, 'libllguidance.so')
        
        if (fs.existsSync(sourceLib)) {
            // For static libraries, we need to create a shared library wrapper
            // This is a simplified approach - in production you might want a proper JNI wrapper
            console.log(`📋 Note: Built static library ${sourceLib}`)
            console.log(`💡 You may need to create a JNI wrapper to use this as a .so file`)
            console.log(`✅ Build completed for ${androidAbi}`)
        } else {
            throw new Error(`Library not found: ${sourceLib}`)
        }
        
    } catch (error) {
        console.error(`❌ Failed to build for ${androidAbi}:`, error.message)
        // Continue with other targets instead of exiting
        console.log(`⚠️  Skipping ${androidAbi}, continuing with other targets...`)
    }
})

// Generate header file for JNI integration
console.log('\n📄 Generating C header for JNI integration...')
try {
    execSync('cargo build --release', {
        cwd: rustProjectPath,
        stdio: 'inherit'
    })
    
    // The build.rs should generate the header
    const headerSource = path.join(rustProjectPath, 'target', 'llguidance_bg.h')
    const headerTarget = path.join(projectRoot, 'android', 'app', 'src', 'main', 'cpp', 'llguidance_bg.h')
    
    if (fs.existsSync(headerSource)) {
        // Ensure cpp directory exists
        const cppDir = path.dirname(headerTarget)
        if (!fs.existsSync(cppDir)) {
            fs.mkdirSync(cppDir, { recursive: true })
        }
        
        fs.copyFileSync(headerSource, headerTarget)
        console.log('✅ Header file generated and copied')
    } else {
        console.log('⚠️  Header file not found, may need manual generation')
    }
    
} catch (error) {
    console.log('⚠️  Header generation failed:', error.message)
}

console.log('\n🎉 LLguidance native module build process completed!')
console.log('\n📋 Next steps:')
console.log('1. Create JNI wrapper in android/app/src/main/cpp/')
console.log('2. Update android/app/build.gradle to include native build')
console.log('3. Register the native module in React Native')
console.log('4. Test the integration')

function getClangTarget(rustTarget) {
    switch (rustTarget) {
        case 'armv7-linux-androideabi': return 'armv7a-linux-androideabi'
        case 'aarch64-linux-android': return 'aarch64-linux-android'
        case 'i686-linux-android': return 'i686-linux-android'
        case 'x86_64-linux-android': return 'x86_64-linux-android'
        default: throw new Error(`Unknown target: ${rustTarget}`)
    }
}