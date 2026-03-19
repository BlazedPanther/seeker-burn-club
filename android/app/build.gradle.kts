plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.dagger.hilt.android")
    id("com.google.devtools.ksp")
}

val debugSkrMint = "CyHB1R1isTShErodMLCWCeXHTQC9SkVqJDG1Ezzk83GM"
val debugTreasuryWallet = "nP25k2QNCiGKwQLyYvuLhKpbRukN7n7qQtbbcEm4Te5"
val debugTreasuryAta = "Pn6FkEHtDqA8RDxJEgkjxUozLjn2weLX58bVS2aWUPD"
val apiHost = "api.seekerburnclub.xyz"

fun debugValue(name: String, fallback: String): String {
    return providers.gradleProperty(name).orNull
        ?: System.getenv(name)
        ?: fallback
}

// Debug defaults target devnet for safe hackathon testing unless explicitly overridden.
val debugBackendUrl = debugValue("DEBUG_BACKEND_URL", "https://seeker-burn-api-production.up.railway.app")
val debugRpcUrl = debugValue("DEBUG_RPC_URL", "https://api.devnet.solana.com")
val debugIsDevnet = debugValue(
    "DEBUG_IS_DEVNET",
    "true"
)

fun releaseValue(name: String): String {
    return providers.gradleProperty(name).orNull
        ?: System.getenv(name)
        ?: "PLACEHOLDER_${name}"
}

val releaseSkrMint = releaseValue("RELEASE_SKR_MINT")
val releaseTreasuryWallet = releaseValue("RELEASE_TREASURY_WALLET")
val releaseTreasuryAta = releaseValue("RELEASE_TREASURY_SKR_ATA")
val releaseApiPinHash1 = releaseValue("RELEASE_API_PIN_HASH_1")
val releaseApiPinHash2 = releaseValue("RELEASE_API_PIN_HASH_2")

// Firebase plugins require google-services.json to exist — apply conditionally
val hasGoogleServices = file("google-services.json").exists()
if (hasGoogleServices) {
    apply(plugin = "com.google.gms.google-services")
    apply(plugin = "com.google.firebase.crashlytics")
}

android {
    namespace = "club.seekerburn.app"
    compileSdk = 35

    signingConfigs {
        create("release") {
            storeFile = file("release.keystore")
            storePassword = "seekerburn123"
            keyAlias = "seekerburn"
            keyPassword = "seekerburn123"
        }
    }

    defaultConfig {
        applicationId = "club.seekerburn.app"
        minSdk = 33
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // ── Debug defaults ────────────────────────────────────────────────────────
        // Override via DEBUG_BACKEND_URL, DEBUG_RPC_URL, DEBUG_IS_DEVNET.
        // IS_DEVNET drives SOLANA_BLOCKCHAIN (Devnet vs Mainnet) in MWA and Solscan URLs.
        buildConfigField("boolean", "IS_DEVNET", debugIsDevnet)

        buildConfigField("String", "SKR_MINT", "\"$debugSkrMint\"")
        buildConfigField("String", "TREASURY_WALLET", "\"$debugTreasuryWallet\"")
        buildConfigField("String", "TREASURY_SKR_ATA", "\"$debugTreasuryAta\"")
        buildConfigField("String", "API_HOST", "\"$apiHost\"")
        buildConfigField("String", "API_PIN_HASH_1", "\"sha256/PLACEHOLDER_DEBUG_PIN_HASH_1=\"")
        buildConfigField("String", "API_PIN_HASH_2", "\"sha256/PLACEHOLDER_DEBUG_PIN_HASH_2=\"")

        buildConfigField("String", "BACKEND_URL", "\"$debugBackendUrl\"")
        buildConfigField("String", "RPC_URL", "\"$debugRpcUrl\"")
        // 1% proportional fee — fee = burnAmount × PLATFORM_FEE_PERCENT / 100
        buildConfigField("double", "PLATFORM_FEE_PERCENT", "1.0")
        buildConfigField("double", "MIN_BURN_SKR", "1.00")
    }

    buildTypes {
        debug {
            // Inherits debug values from defaultConfig.
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // ── Mainnet release overrides ────────────────────────────────────────
            buildConfigField("boolean", "IS_DEVNET", "false")
            buildConfigField("String", "BACKEND_URL", "\"https://api.seekerburnclub.xyz\"")
            buildConfigField("String", "RPC_URL", "\"https://api.mainnet-beta.solana.com\"")
            buildConfigField("String", "SKR_MINT", "\"$releaseSkrMint\"")
            buildConfigField("String", "TREASURY_WALLET", "\"$releaseTreasuryWallet\"")
            buildConfigField("String", "TREASURY_SKR_ATA", "\"$releaseTreasuryAta\"")
            buildConfigField("String", "API_HOST", "\"$apiHost\"")
            buildConfigField("String", "API_PIN_HASH_1", "\"$releaseApiPinHash1\"")
            buildConfigField("String", "API_PIN_HASH_2", "\"$releaseApiPinHash2\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

val validateReleaseConfig by tasks.registering {
    group = "verification"
    description = "Validates production release config values before building release APKs."
    doLast {
        val failures = mutableListOf<String>()

        fun requireRealValue(name: String, value: String) {
            if (value.startsWith("PLACEHOLDER_")) {
                failures += "$name is not configured (got placeholder)."
            }
        }

        requireRealValue("RELEASE_SKR_MINT", releaseSkrMint)
        requireRealValue("RELEASE_TREASURY_WALLET", releaseTreasuryWallet)
        requireRealValue("RELEASE_TREASURY_SKR_ATA", releaseTreasuryAta)
        requireRealValue("RELEASE_API_PIN_HASH_1", releaseApiPinHash1)
        requireRealValue("RELEASE_API_PIN_HASH_2", releaseApiPinHash2)

        if (releaseSkrMint == debugSkrMint) {
            failures += "RELEASE_SKR_MINT must not equal debug/devnet mint."
        }
        if (releaseTreasuryWallet == debugTreasuryWallet) {
            failures += "RELEASE_TREASURY_WALLET must not equal debug/devnet treasury wallet."
        }
        if (releaseTreasuryAta == debugTreasuryAta) {
            failures += "RELEASE_TREASURY_SKR_ATA must not equal debug/devnet treasury ATA."
        }
        if (!releaseApiPinHash1.startsWith("sha256/")) {
            failures += "RELEASE_API_PIN_HASH_1 must start with 'sha256/'."
        }
        if (!releaseApiPinHash2.startsWith("sha256/")) {
            failures += "RELEASE_API_PIN_HASH_2 must start with 'sha256/'."
        }

        if (failures.isNotEmpty()) {
            throw GradleException(
                "Release config validation failed:\n- " + failures.joinToString("\n- ") +
                    "\n\nProvide values via gradle.properties or environment variables:\n" +
                    "RELEASE_SKR_MINT, RELEASE_TREASURY_WALLET, RELEASE_TREASURY_SKR_ATA, " +
                    "RELEASE_API_PIN_HASH_1, RELEASE_API_PIN_HASH_2"
            )
        }
    }
}

tasks.matching { it.name in setOf("assembleRelease", "bundleRelease", "packageRelease") }
    .configureEach {
        dependsOn(validateReleaseConfig)
    }

dependencies {
    // Core Android
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")

    // Compose BOM
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.animation:animation")
    implementation("androidx.compose.foundation:foundation")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")

    // Navigation
    implementation("androidx.navigation:navigation-compose:2.8.5")

    // Hilt DI
    implementation("com.google.dagger:hilt-android:2.53.1")
    ksp("com.google.dagger:hilt-compiler:2.53.1")
    implementation("androidx.hilt:hilt-navigation-compose:1.2.0")

    // Networking
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("io.ktor:ktor-client-core:3.0.3")
    implementation("io.ktor:ktor-client-okhttp:3.0.3")
    implementation("io.ktor:ktor-client-content-negotiation:3.0.3")
    implementation("io.ktor:ktor-client-logging:3.0.3")
    implementation("io.ktor:ktor-serialization-kotlinx-json:3.0.3")

    // Serialization
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    // DataStore (encrypted preferences)
    implementation("androidx.datastore:datastore-preferences:1.1.1")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // Solana
    implementation("com.solanamobile:mobile-wallet-adapter-clientlib-ktx:2.0.3")
    implementation("org.sol4k:sol4k:0.5.3")

    // QR code generation (referral sharing)
    implementation("com.google.zxing:core:3.5.3")

    // Image loading
    implementation("io.coil-kt:coil-compose:2.7.0")
    implementation("io.coil-kt:coil-svg:2.7.0")
    implementation("io.coil-kt:coil-gif:2.7.0")

    // Splash screen
    implementation("androidx.core:core-splashscreen:1.0.1")

    // Background reminders
    implementation("androidx.work:work-runtime-ktx:2.10.0")

    // Firebase Crashlytics (optional; enabled only when google-services.json is present)
    if (hasGoogleServices) {
        implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
        implementation("com.google.firebase:firebase-crashlytics")
        implementation("com.google.firebase:firebase-analytics")
    }

    // Testing
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation(platform("androidx.compose:compose-bom:2024.12.01"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
}
