package com.voicenag.reminders

import android.content.Context
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*

data class Task(
    val id: Int,
    val title: String,
    val dueTime: Long,
    val nagIntervalMins: Int,
    var isCompleted: Boolean
)

object TaskManager {
    private const val PREFS = "nag_reminders_prefs"
    private const val KEY_TASKS = "tasks_json"

    fun getTasks(context: Context): List<Task> {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val jsonStr = prefs.getString(KEY_TASKS, "[]") ?: "[]"
        val array = JSONArray(jsonStr)
        val list = mutableListOf<Task>()
        for (i in 0 until array.length()) {
            val obj = array.getJSONObject(i)
            list.add(
                Task(
                    id = obj.getInt("id"),
                    title = obj.getString("title"),
                    dueTime = obj.getLong("dueTime"),
                    nagIntervalMins = obj.getInt("nagIntervalMins"),
                    isCompleted = obj.getBoolean("isCompleted")
                )
            )
        }
        return list
    }

    fun saveTask(context: Context, task: Task) {
        val current = getTasks(context).toMutableList()
        current.add(0, task)
        saveList(context, current)
    }

    fun getTaskById(context: Context, id: Int): Task? {
        return getTasks(context).find { it.id == id }
    }

    fun markCompleted(context: Context, id: Int) {
        val current = getTasks(context).toMutableList()
        current.find { it.id == id }?.isCompleted = true
        saveList(context, current)
    }

    private fun saveList(context: Context, list: List<Task>) {
        val array = JSONArray()
        list.forEach { task ->
            val obj = JSONObject().apply {
                put("id", task.id)
                put("title", task.title)
                put("dueTime", task.dueTime)
                put("nagIntervalMins", task.nagIntervalMins)
                put("isCompleted", task.isCompleted)
            }
            array.put(obj)
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_TASKS, array.toString())
            .apply()
    }
}

class TaskAdapter(
    private var tasks: List<Task>,
    private val onDoneClicked: (Int) -> Unit
) : RecyclerView.Adapter<TaskAdapter.ViewHolder>() {

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val tvTitle: TextView = view.findViewById(R.id.itemTitle)
        val tvTime: TextView = view.findViewById(R.id.itemTime)
        val btnDone: Button = view.findViewById(R.id.itemBtnDone)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_task, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val task = tasks[position]
        holder.tvTitle.text = task.title
        val sdf = SimpleDateFormat("MMM dd, HH:mm", Locale.getDefault())
        holder.tvTime.text = "Due: " + sdf.format(Date(task.dueTime)) + " (Nags every " + task.nagIntervalMins + "m)"

        if (task.isCompleted) {
            holder.btnDone.text = "Done ✓"
            holder.btnDone.isEnabled = false
        } else {
            holder.btnDone.text = "Complete"
            holder.btnDone.isEnabled = true
            holder.btnDone.setOnClickListener { onDoneClicked(task.id) }
        }
    }

    override fun getItemCount() = tasks.size

    fun updateList(newTasks: List<Task>) {
        tasks = newTasks
        notifyDataSetChanged()
    }
}