package com.voicenag.reminders

import android.Manifest
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.text.SimpleDateFormat
import java.util.*

class MainActivity : AppCompatActivity() {

    private lateinit var speechRecognizer: SpeechRecognizer
    private lateinit var btnMic: Button
    private lateinit var etTaskTitle: EditText
    private lateinit var tvStatus: TextView
    private lateinit var btnSave: Button
    private lateinit var rvTasks: RecyclerView
    private lateinit var taskAdapter: TaskAdapter

    private val RECORD_AUDIO_REQUEST_CODE = 101

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        checkPermissions()

        btnMic = findViewById(R.id.btnMic)
        etTaskTitle = findViewById(R.id.etTaskTitle)
        tvStatus = findViewById(R.id.tvStatus)
        btnSave = findViewById(R.id.btnSave)
        rvTasks = findViewById(R.id.rvTasks)

        setupRecyclerView()
        setupSpeechRecognizer()

        btnMic.setOnClickListener {
            startVoiceInput()
        }

        btnSave.setOnClickListener {
            val title = etTaskTitle.text.toString().trim()
            if (title.isNotEmpty()) {
                // Schedule reminder 5 minutes from now as default nag test
                val dueTime = System.currentTimeMillis() + 5 * 60 * 1000
                scheduleNagReminder(title, dueTime, 2) // Nag every 2 mins
                etTaskTitle.setText("")
                tvStatus.text = "Reminder saved! Will nag until marked done."
                loadTasks()
            } else {
                Toast.makeText(this, "Please speak or enter a task", Toast.LENGTH_SHORT).show()
            }
        }

        loadTasks()
    }

    private fun checkPermissions() {
        val permissions = mutableListOf(Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        val needed = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (needed.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toTypedArray(), RECORD_AUDIO_REQUEST_CODE)
        }
    }

    private fun setupSpeechRecognizer() {
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this)
        speechRecognizer.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                tvStatus.text = "Listening... Speak your task now"
            }
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {
                tvStatus.text = "Processing speech..."
            }
            override fun onError(error: Int) {
                tvStatus.text = "Speech error code: $error. Tap mic to retry."
            }
            override fun onResults(results: Bundle?) {
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                if (!matches.isNullOrEmpty()) {
                    val text = matches[0]
                    etTaskTitle.setText(text)
                    tvStatus.text = "Recognized: \"$text\""
                }
            }
            override fun onPartialResults(partialResults: Bundle?) {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
    }

    private fun startVoiceInput() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
            putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak task & time...")
        }
        speechRecognizer.startListening(intent)
    }

    private fun scheduleNagReminder(title: String, dueTime: Long, nagIntervalMins: Int) {
        val task = Task(
            id = System.currentTimeMillis().toInt(),
            title = title,
            dueTime = dueTime,
            nagIntervalMins = nagIntervalMins,
            isCompleted = false
        )
        TaskManager.saveTask(this, task)

        val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(this, ReminderReceiver::class.java).apply {
            putExtra("TASK_ID", task.id)
            putExtra("TASK_TITLE", task.title)
            putExtra("NAG_INTERVAL", task.nagIntervalMins)
        }

        val pendingIntent = PendingIntent.getBroadcast(
            this,
            task.id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, dueTime, pendingIntent)
    }

    private fun setupRecyclerView() {
        rvTasks.layoutManager = LinearLayoutManager(this)
        taskAdapter = TaskAdapter(emptyList()) { taskId ->
            TaskManager.markCompleted(this, taskId)
            loadTasks()
            Toast.makeText(this, "Task completed! Reminder stopped.", Toast.LENGTH_SHORT).show()
        }
        rvTasks.adapter = taskAdapter
    }

    private fun loadTasks() {
        val list = TaskManager.getTasks(this)
        taskAdapter.updateList(list)
    }

    override fun onDestroy() {
        super.onDestroy()
        speechRecognizer.destroy()
    }
}