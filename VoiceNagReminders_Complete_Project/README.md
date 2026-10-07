# Voice Nag Reminders - Native Android App

A lightweight, custom Android application that fulfills two core requirements:
1. **Voice Input**: Tap the microphone and speak your reminder.
2. **Persistent Nagging Alarms**: Once due, it alarms repeatedly via `AlarmManager` and high-priority notifications until you confirm the task is completed. Once confirmed, all future reminders for that task cease immediately.

## Key Architecture & Features
- **SpeechRecognizer**: Built-in Android voice recognition engine.
- **AlarmManager + RTC_WAKEUP**: Wakes the device from doze mode when due.
- **Persistent Recurring Notifications**: Plays sound, vibrates, and re-schedules itself every *N* minutes if not completed.
- **Direct 'Complete' Action**: Complete tasks directly from the notification tray or from the app UI. Once marked done, the recurring alarm is immediately cancelled and silenced.

## Project Structure
- `MainActivity.kt`: Handles UI, SpeechRecognizer, and task listings.
- `ReminderReceiver.kt`: Catches the AlarmManager trigger, sends the nagging notification, and re-arms the alarm.
- `AlarmActionReceiver.kt`: Handles the notification "Mark Completed" button, cancels alarms, and dismisses notifications.
- `TaskManager.kt`: SharedPreferences data persistence.

## How to Build & Install
1. Open this folder in **Android Studio**.
2. Connect your Android phone with USB Debugging enabled (or use an emulator).
3. Click **Run > Run 'app'** or build the APK via **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
4. Grant Audio & Notification permissions when prompted.