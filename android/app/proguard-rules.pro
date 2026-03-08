# ──────────────────────────────────────────
# Seeker Burn Club – ProGuard / R8 Rules
# ──────────────────────────────────────────

# ── kotlinx-serialization ──
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Keep all @Serializable data classes and their serializer companions
-keep,includedescriptorclasses class club.seekerburn.app.model.**$$serializer { *; }
-keepclassmembers class club.seekerburn.app.model.** {
    *** Companion;
}
-keepclasseswithmembers class club.seekerburn.app.model.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# ── Ktor ──
-keep class io.ktor.** { *; }
-dontwarn io.ktor.**
-keep class io.ktor.client.engine.okhttp.** { *; }
-keep class io.ktor.serialization.kotlinx.json.** { *; }

# ── OkHttp ──
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
-keep class okhttp3.** { *; }

# ── sol4k (Solana SDK) ──
-keep class org.sol4k.** { *; }
-dontwarn org.sol4k.**

# ── Mobile Wallet Adapter (MWA) ──
-keep class com.solana.mobilewalletadapter.** { *; }
-dontwarn com.solana.mobilewalletadapter.**

# ── Hilt / Dagger ──
-dontwarn dagger.hilt.internal.aggregatedroot.codegen.**
-keep class dagger.hilt.** { *; }
-keep class javax.inject.** { *; }
-keep class * extends dagger.hilt.android.internal.managers.ViewComponentManager$FragmentContextWrapper { *; }

# ── Compose ──
-dontwarn androidx.compose.**

# ── DataStore ──
-keep class androidx.datastore.** { *; }

# ── Security Crypto (EncryptedSharedPreferences) ──
-keep class androidx.security.crypto.** { *; }
-keep class com.google.crypto.tink.** { *; }
-dontwarn com.google.crypto.tink.**

# ── Kotlin coroutines ──
-dontwarn kotlinx.coroutines.**

# ── General Android ──
-keep class * implements android.os.Parcelable { *; }
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    !static !transient <fields>;
    !private <fields>;
    !private <methods>;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# ── Enum safety ──
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}
