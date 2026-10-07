package com.voicenag.reminders

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat

class ReminderReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val taskId = intent.getIntExtra("TASK_ID", -1)
        val title = intent.getStringExtra("TASK_TITLE") ?: "Task Due!"
        val nagInterval = intent.getIntExtra("NAG_INTERVAL", 2)

        val task = TaskManager.getTaskById(context, taskId)
        // If task is completed or not found, stop reminding!
        if (task == null || task.isCompleted) {
            return
        }

        // 1. Show persistent alert notification
        showNotification(context, taskId, title)

        // 2. Schedule NEXT nag reminder (repeats until completed!)
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val nextIntent = Intent(context, ReminderReceiver::class.java).apply {
            putExtra("TASK_ID", taskId)
            putExtra("TASK_TITLE", title)
            putExtra("NAG_INTERVAL", nagInterval)
        }
        val nextPending = PendingIntent.getBroadcast(
            context,
            taskId,
            nextIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val nextTriggerTime = System.currentTimeMillis() + (nagInterval * 60 * 1000)
        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextTriggerTime, nextPending)
    }

    private fun showNotification(context: Context, taskId: Int, title: String) {
        val channelId = "nag_reminders_channel"
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Nag Reminders",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Persistent reminders that repeat until marked completed"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 500, 200, 500)
            }
            notificationManager.createNotificationChannel(channel)
        }

        // Action Intent to Mark Completed directly from notification
        val doneIntent = Intent(context, AlarmActionReceiver::class.java).apply {
            action = "ACTION_MARK_DONE"
            putExtra("TASK_ID", taskId)
        }
        val donePendingIntent = PendingIntent.getBroadcast(
            context,
            taskId,
            doneIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("⚠️ Nagging: $title")
            .setContentText("Tap 'Done' to complete task and stop persistent alerts.")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setSound(alarmSound)
            .setOngoing(true)
            .addAction(android.R.drawable.checkbox_on_background, "✓ Mark Completed", donePendingIntent)

        notificationManager.notify(taskId, builder.build())
    }
}