#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🔧 Setting up Android NDK for LLguidance...');

function runCommand(command, options = {}) {
    console.log(`📦 Running: ${command}`);
    try {
        execSync(command, { stdio: 'inherit', ...options });
    } catch (error) {
        console.error(`❌ Command failed: ${command}`);
        process.exit(1);
    }
}

function findAndroidSDK() {
    const possiblePaths = [
        process.env.ANDROID_SDK_ROOT,
        process.env.ANDROID_HOME,
        path.join(os.homedir(), 'Android', 'Sdk'),
        path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk'), // Windows
        path.join(os.homedir(), 'Library', 'Android', 'sdk'), // macOS
        '/usr/local/android-sdk',
        '/opt/android-sdk'
    ].filter(Boolean);

    for (const sdkPath of possiblePaths) {
        if (fs.existsSync(sdkPath)) {
            console.log(`📱 Found Android SDK: ${sdkPath}`);
            return sdkPath;
        }
    }

    return null;
}

function findAndroidNDK(sdkPath) {
    if (!sdkPath) return null;

    const ndkPath = path.join(sdkPath, 'ndk');
    if (!fs.existsSync(ndkPath)) {
        return null;
    }

    // Find latest NDK version
    const ndkVersions = fs.readdirSync(ndkPath)
        .filter(name => fs.statSync(path.join(ndkPath, name)).isDirectory())
        .sort()
        .reverse();

    if (ndkVersions.length === 0) {
        return null;
    }

    const latestNdk = path.join(ndkPath, ndkVersions[0]);
    console.log(`🔨 Found Android NDK: ${latestNdk}`);
    return latestNdk;
}

async function main() {
    // Check if NDK is already configured
    const existingNdk = process.env.ANDROID_NDK_ROOT || process.env.NDK_ROOT || process.env.ANDROID_NDK_HOME;
    if (existingNdk && fs.existsSync(existingNdk)) {
        console.log(`✅ Android NDK already configured: ${existingNdk}`);
        return existingNdk;
    }

    // Try to find Android SDK
    const sdkPath = findAndroidSDK();
    if (!sdkPath) {
        console.error('❌ Android SDK not found!');
        console.log('💡 Please install Android Studio or set ANDROID_SDK_ROOT environment variable');
        process.exit(1);
    }

    // Try to find NDK
    const ndkPath = findAndroidNDK(sdkPath);
    if (!ndkPath) {
        console.log('⚠️  Android NDK not found in SDK directory');
        console.log('💡 Installing NDK via sdkmanager...');
        
        const sdkmanager = process.platform === 'win32' 
            ? path.join(sdkPath, 'cmdline-tools', 'latest', 'bin', 'sdkmanager.bat')
            : path.join(sdkPath, 'cmdline-tools', 'latest', 'bin', 'sdkmanager');
        
        if (fs.existsSync(sdkmanager)) {
            runCommand(`"${sdkmanager}" "ndk;25.1.8937393"`);
            const installedNdk = path.join(sdkPath, 'ndk', '25.1.8937393');
            if (fs.existsSync(installedNdk)) {
                console.log(`✅ NDK installed: ${installedNdk}`);
                return installedNdk;
            }
        }
        
        console.error('❌ Failed to install NDK automatically');
        console.log('💡 Please install NDK manually through Android Studio SDK Manager');
        process.exit(1);
    }

    return ndkPath;
}

main().then(ndkPath => {
    console.log('🎉 Android NDK setup completed!');
    console.log(`📝 Add this to your environment:`);
    if (process.platform === 'win32') {
        console.log(`   set ANDROID_NDK_ROOT=${ndkPath}`);
    } else {
        console.log(`   export ANDROID_NDK_ROOT="${ndkPath}"`);
    }
    console.log(`🚀 Now you can run: npm run build:llguidance:android`);
}).catch(error => {
    console.error('❌ Setup failed:', error);
    process.exit(1);
});