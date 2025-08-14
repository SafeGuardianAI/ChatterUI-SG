const IS_DEV = process.env.APP_VARIANT === 'development'

module.exports = {
    expo: {
        name: IS_DEV ? 'SafeGuardianAI (DEV)' : 'SafeGuardianAI',
        newArchEnabled: true,
        slug: 'SafeGuardianAI',
        version: '0.0.1-beta1',
        orientation: 'default',
        icon: './assets/images/logo_small.jpg',
        scheme: 'safeguardianai',
        userInterfaceStyle: 'automatic',
        assetBundlePatterns: ['**/*'],
        ios: {
            icon: {
                dark: './assets/images/logo_small.jpg',
                light: './assets/images/logo_small.jpg',
                tinted: './assets/images/logo_small.jpg',
            },
            supportsTablet: true,
            package: IS_DEV ? 'com.SG.SafeGuardianAIDev' : 'com.SG.SafeGuardianAI',
            bundleIdentifier: IS_DEV ? 'com.SG.SafeGuardianAIDev' : 'com.SG.SafeGuardianAI',
        },
        android: {
            adaptiveIcon: {
                foregroundImage: './assets/images/logo_small.jpg',
                backgroundImage: './assets/images/logo_small.jpg',
                monochromeImage: './assets/images/logo_small.jpg',
                backgroundColor: '#000',
            },
            edgeToEdgeEnabled: true,
            package: IS_DEV ? 'com.SG.SafeGuardianAIDev' : 'com.SG.SafeGuardianAI',
            userInterfaceStyle: 'dark',
            permissions: [
                'android.permission.FOREGROUND_SERVICE',
                'android.permission.WAKE_LOCK',
                'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
                // Mesh networking permissions
                'android.permission.INTERNET',
                'android.permission.ACCESS_NETWORK_STATE',
                'android.permission.ACCESS_WIFI_STATE',
                'android.permission.CHANGE_WIFI_STATE',
                'android.permission.ACCESS_COARSE_LOCATION',
                'android.permission.ACCESS_FINE_LOCATION',
                'android.permission.BLUETOOTH',
                'android.permission.BLUETOOTH_ADMIN',
                'android.permission.BLUETOOTH_CONNECT',
                'android.permission.BLUETOOTH_ADVERTISE',
                'android.permission.BLUETOOTH_SCAN',
                'android.permission.NEARBY_WIFI_DEVICES',
            ],
        },
        web: {
            bundler: 'metro',
            output: 'static',
            favicon: './assets/images/logo_small.jpg',
        },
        plugins: [
            [
                'expo-asset',
                {
                    assets: ['./assets/models/aibot.png', './assets/models/llama3tokenizer.gguf'],
                },
            ],
            [
                'expo-build-properties',
                {
                    android: {
                        largeHeap: true,
                        usesCleartextTraffic: true,
                        enableProguardInReleaseBuilds: true,
                        enableShrinkResourcesInReleaseBuilds: true,
                        useLegacyPackaging: true,
                        extraProguardRules: '-keep class com.rnllama.** { *; }',
                    },
                },
            ],
            [
                'expo-splash-screen',
                {
                    backgroundColor: '#000000',
                    image: './assets/images/adaptive-icon.png',
                    imageWidth: 200,
                },
            ],
            [
                'expo-notifications',
                {
                    icon: './assets/images/notification.png',
                },
            ],
            [
                './expo-build-plugins/androidattributes.plugin.js',
                {
                    'android:largeHeap': true,
                },
            ],
            'expo-localization',
            'expo-router',
            'expo-sqlite',
            './expo-build-plugins/bgactions.plugin.js',
            './expo-build-plugins/copyjni.plugin.js',
            './expo-build-plugins/usercert.plugin.js',
        ],
        experiments: {
            typedRoutes: true,
            reactCompiler: true,
        },
        extra: {
            router: {
                origin: false,
            },
        },
    },
}
