package club.seekerburn.app.di

import club.seekerburn.app.BuildConfig
import club.seekerburn.app.config.SeekerBurnConfig
import club.seekerburn.app.data.api.SeekerBurnApi
import club.seekerburn.app.data.api.SeekerBurnApiImpl
import club.seekerburn.app.data.local.SessionStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.ktor.client.*
import io.ktor.client.engine.okhttp.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.plugins.HttpResponseValidator
import io.ktor.client.plugins.logging.*
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.json.Json
import okhttp3.CertificatePinner
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

/** Exception thrown when backend returns a non-success HTTP response. */
class ApiException(val statusCode: Int, val body: String) :
    Exception("HTTP $statusCode: $body")

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    @Provides
    @Singleton
    fun provideHttpClient(json: Json): HttpClient = HttpClient(OkHttp) {
        engine {
            config {
                connectTimeout(10, TimeUnit.SECONDS)
                readTimeout(15, TimeUnit.SECONDS)
                writeTimeout(10, TimeUnit.SECONDS)
            }

            // Certificate pinning for the production API host.
            // Release values are injected via BuildConfig from gradle properties/env vars.
            //
            // Example pin generation:
            // openssl s_client -connect <host>:443 | openssl x509 -pubkey -noout |
            // openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl enc -base64
            val pinHost = BuildConfig.API_HOST
            val pinHash1 = BuildConfig.API_PIN_HASH_1
            val pinHash2 = BuildConfig.API_PIN_HASH_2
            val hasRealPins =
                pinHash1.startsWith("sha256/") &&
                pinHash2.startsWith("sha256/") &&
                !pinHash1.contains("PLACEHOLDER") &&
                !pinHash2.contains("PLACEHOLDER")

            if (!BuildConfig.DEBUG && hasRealPins) {
                config {
                    certificatePinner(
                        CertificatePinner.Builder()
                            .add(
                                pinHost,
                                pinHash1,
                                pinHash2,
                            )
                            .build()
                    )
                }
            } else if (!BuildConfig.DEBUG) {
                // Release build without real pins — HARD FAIL to prevent shipping insecure builds
                throw IllegalStateException(
                    "RELEASE BUILD WITHOUT CERTIFICATE PINNING — " +
                    "set RELEASE_API_PIN_HASH_1 and RELEASE_API_PIN_HASH_2 before shipping!"
                )
            }
        }
        install(ContentNegotiation) {
            json(json)
        }
        install(Logging) {
            // Use INFO (not BODY) to avoid leaking Bearer tokens and request bodies to logcat
            level = if (BuildConfig.DEBUG) LogLevel.INFO else LogLevel.NONE
            sanitizeHeader { header -> header == io.ktor.http.HttpHeaders.Authorization }
        }
        HttpResponseValidator {
            validateResponse { response ->
                if (response.status.value == 401) {
                    // Session expired or revoked — clear local session so UI triggers re-auth
                    throw club.seekerburn.app.data.api.TokenExpiredException()
                }
                if (response.status.value >= 400) {
                    val errorBody = response.bodyAsText()
                    throw ApiException(response.status.value, errorBody)
                }
            }
        }
        defaultRequest {
            url(SeekerBurnConfig.BACKEND_URL)
            contentType(ContentType.Application.Json)
        }
    }

    @Provides
    @Singleton
    fun provideApi(client: HttpClient, sessionStore: SessionStore): SeekerBurnApi {
        return SeekerBurnApiImpl(client, sessionStore)
    }
}
