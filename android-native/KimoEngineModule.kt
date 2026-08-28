package com.realestate.app.agent

import android.os.Handler
import android.os.Looper
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * وحدة أصلية تستدعي محرك كيمو البايثوني المضمَّن (عبر Chaquopy) داخل معالج
 * التطبيق. تفتح بايثون نفس ملف قاعدة التطبيق (expo-sqlite) فتكتب المحادثة في
 * agent_messages / agent_sessions مباشرةً. تُسجَّل في MainApplication.
 *
 * ملاحظة: عدّل اسم الحزمة (package) ليطابق مشروعك.
 *
 * مهم: Chaquopy تشترط استدعاء [Python.start] على الخيط الرئيسي (UI)، وإلا
 * يحدث انهيار أصلي (SIGSEGV) داخل PyObject_GC_Del أثناء تهيئة المفسر. لذلك يبدأ
 * المحرك بكسل عند أول رسالة لكن على الخيط الرئيسي عبر Handler(Looper.mainLooper).
 */
class KimoEngineModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "KimoEngine"

    @ReactMethod
    fun runChat(
        sessionId: String,
        text: String,
        dbName: String,
        mock: Int,
        providerId: String,
        model: String,
        apiKey: String,
        baseUrl: String,
        promise: Promise,
    ) {
        try {
            ensurePythonStarted()
            val py = Python.getInstance()
            val dbPath = reactContext.getDatabasePath(dbName).absolutePath
            val module = py.getModule("kimo_embed")
            val result = module.callAttr(
                "run_chat_sync",
                sessionId,
                text,
                dbPath,
                mock == 1,
                providerId ?: "",
                model ?: "",
                apiKey ?: "",
                baseUrl ?: "",
            )
            promise.resolve(result.toString())
        } catch (e: Exception) {
            promise.reject("KIMO_ERROR", e.localizedMessage ?: e.toString(), e)
        }
    }

    private fun ensurePythonStarted() {
        if (Python.isStarted()) return
        synchronized(KimoEngineModule::class.java) {
            if (Python.isStarted()) return
            val latch = CountDownLatch(1)
            var startError: Throwable? = null
            val starter = Runnable {
                try {
                    if (!Python.isStarted()) {
                        Python.start(AndroidPlatform(reactContext.applicationContext))
                    }
                } catch (t: Throwable) {
                    startError = t
                } finally {
                    latch.countDown()
                }
            }
            if (Looper.getMainLooper().thread == Thread.currentThread()) {
                starter.run()
            } else {
                Handler(Looper.getMainLooper()).post(starter)
                latch.await(30, TimeUnit.SECONDS)
            }
            if (startError != null) throw startError!!
        }
    }
}

class KimoEnginePackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(KimoEngineModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
