// --- State & LocalStorage ---
    let tasks = JSON.parse(localStorage.getItem('nag_reminders_tasks') || '[]');
    let currentTab = 'active';
    let activeAlarmTaskId = null;
    let alarmAudioInterval = null;

    // --- Audio Synthesis via Web Audio API (No external sound files required) ---
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    let audioCtx = null;

    function initAudio() {
      if (!audioCtx) {
        audioCtx = new AudioContext();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
    }

    function playBeepPattern() {
      try {
        initAudio();
        const now = audioCtx.currentTime;

        // Create 3 rapid pleasant alert beeps
        [0, 0.15, 0.3].forEach((delay, idx) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(idx === 2 ? 880 : 587.33, now + delay); // D5 then A5

          gain.gain.setValueAtTime(0.3, now + delay);
          gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.12);

          osc.connect(gain);
          gain.connect(audioCtx.destination);

          osc.start(now + delay);
          osc.stop(now + delay + 0.13);
        });

        // Vibration for mobile devices
        if ('vibrate' in navigator) {
          navigator.vibrate([300, 150, 300, 150, 450]);
        }
      } catch (e) {
        console.warn('Audio playback error:', e);
      }
    }

    // --- Speech Recognition ---
    const micBtn = document.getElementById('micBtn');
    const transcriptBox = document.getElementById('transcriptBox');
    const taskInput = document.getElementById('taskInput');
    const dateInput = document.getElementById('dateInput');
    const nagInterval = document.getElementById('nagInterval');

    // Default datetime-local to 10 minutes from now
    function getDefaultDateTimeString(minsAhead = 10) {
      const d = new Date(Date.now() + minsAhead * 60000);
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    dateInput.value = getDefaultDateTimeString(10);

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    let isListening = false;

    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        isListening = true;
        micBtn.classList.add('listening');
        transcriptBox.textContent = 'Listening... Speak your task and time';
        initAudio();
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        transcriptBox.textContent = `"${transcript}"`;
        if (event.results[0].isFinal) {
          parseVoiceCommand(transcript);
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech error:', event.error);
        micBtn.classList.remove('listening');
        isListening = false;
        transcriptBox.textContent = `Error: ${event.error}. You can also type below!`;
      };

      recognition.onend = () => {
        micBtn.classList.remove('listening');
        isListening = false;
      };

      micBtn.addEventListener('click', () => {
        initAudio();
        if (isListening) {
          recognition.stop();
        } else {
          try {
            recognition.start();
          } catch(e) {
            console.warn(e);
          }
        }
      });
    } else {
      transcriptBox.textContent = 'Web Speech not supported in this browser. Please type below.';
      micBtn.style.opacity = '0.5';
    }

    // --- Natural Language Date & Task Parser ---
    function parseVoiceCommand(text) {
      let cleaned = text.trim();
      let targetDate = new Date();
      let detectedTime = false;

      // Check relative minutes/hours: "in 15 minutes", "in 1 hour"
      const inMinutesMatch = cleaned.match(/in\\s+(\\d+)\\s*(minute|min|m)s?/i);
      const inHoursMatch = cleaned.match(/in\\s+(\\d+)\\s*(hour|hr|h)s?/i);

      if (inMinutesMatch) {
        const mins = parseInt(inMinutesMatch[1], 10);
        targetDate = new Date(Date.now() + mins * 60000);
        detectedTime = true;
        cleaned = cleaned.replace(inMinutesMatch[0], '');
      } else if (inHoursMatch) {
        const hrs = parseInt(inHoursMatch[1], 10);
        targetDate = new Date(Date.now() + hrs * 3600000);
        detectedTime = true;
        cleaned = cleaned.replace(inHoursMatch[0], '');
      }

      // Check "tomorrow"
      if (/tomorrow/i.test(cleaned)) {
        targetDate.setDate(targetDate.getDate() + 1);
        detectedTime = true;
        cleaned = cleaned.replace(/tomorrow/i, '');
      }

      // Check explicit time like "at 5:30 pm", "at 4 pm", "at 10 am"
      const timeMatch = cleaned.match(/at\\s+(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1], 10);
        let minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
        const meridian = timeMatch[3] ? timeMatch[3].toLowerCase() : null;

        if (meridian === 'pm' && hours < 12) hours += 12;
        if (meridian === 'am' && hours === 12) hours = 0;

        targetDate.setHours(hours, minutes, 0, 0);
        detectedTime = true;
        cleaned = cleaned.replace(timeMatch[0], '');
      }

      // Clean up common filler words
      cleaned = cleaned.replace(/^(remind me to|remind me|schedule|add a task to|add task)\\s+/i, '');
      cleaned = cleaned.replace(/\\s+(today|tonight)$/i, '');
      cleaned = cleaned.trim();

      // If no future time was detected, default to 15 minutes from now
      if (!detectedTime || targetDate.getTime() <= Date.now()) {
        if (!detectedTime) {
          targetDate = new Date(Date.now() + 15 * 60000);
        } else {
          // If time is earlier today, assume tomorrow
          targetDate.setDate(targetDate.getDate() + 1);
        }
      }

      // Populate input fields
      taskInput.value = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      
      const pad = n => String(n).padStart(2, '0');
      dateInput.value = `${targetDate.getFullYear()}-${pad(targetDate.getMonth()+1)}-${pad(targetDate.getDate())}T${pad(targetDate.getHours())}:${pad(targetDate.getMinutes())}`;
      
      transcriptBox.innerHTML = `✓ Recognized: <b>${taskInput.value}</b><br><small>Scheduled for ${targetDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</small>`;
    }

    // --- Save & Manage Tasks ---
    document.getElementById('saveTaskBtn').addEventListener('click', () => {
      const title = taskInput.value.trim();
      const dueStr = dateInput.value;
      const intervalMins = parseInt(nagInterval.value, 10);

      if (!title) {
        alert('Please enter or speak a task title');
        return;
      }
      if (!dueStr) {
        alert('Please select a reminder date & time');
        return;
      }

      initAudio();

      const newTask = {
        id: 'task_' + Date.now(),
        title: title,
        dueDate: new Date(dueStr).getTime(),
        nagIntervalMinutes: intervalMins,
        completed: false,
        completedAt: null,
        lastNaggedAt: 0,
        createdAt: Date.now()
      };

      tasks.unshift(newTask);
      saveTasks();
      renderTasks();

      // Reset form
      taskInput.value = '';
      dateInput.value = getDefaultDateTimeString(10);
      transcriptBox.textContent = 'Task saved! It will remind you until marked done.';

      // Request notification permission if not yet decided
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    });

    function saveTasks() {
      localStorage.setItem('nag_reminders_tasks', JSON.stringify(tasks));
      updateCounts();
    }

    function updateCounts() {
      const active = tasks.filter(t => !t.completed).length;
      const completed = tasks.filter(t => t.completed).length;
      document.getElementById('activeCount').textContent = active;
      document.getElementById('completedCount').textContent = completed;
    }

    // --- Complete Task (Stops Nagging Permanently) ---
    function completeTask(id) {
      const task = tasks.find(t => t.id === id);
      if (task) {
        task.completed = true;
        task.completedAt = Date.now();
        saveTasks();
        renderTasks();

        // Dismiss modal if this was the active alarm
        if (activeAlarmTaskId === id) {
          stopAlarmModal();
        }
      }
    }

    function deleteTask(id) {
      tasks = tasks.filter(t => t.id !== id);
      saveTasks();
      renderTasks();
      if (activeAlarmTaskId === id) {
        stopAlarmModal();
      }
    }

    function snoozeTask(id, mins = 5) {
      const task = tasks.find(t => t.id === id);
      if (task) {
        task.dueDate = Date.now() + mins * 60000;
        task.lastNaggedAt = Date.now();
        saveTasks();
        renderTasks();
        stopAlarmModal();
      }
    }

    // --- Urgent Nagging Alarm Modal ---
    const alarmModal = document.getElementById('alarmModal');
    const alarmModalTitle = document.getElementById('alarmModalTitle');
    const alarmNagNotice = document.getElementById('alarmNagNotice');
    const modalCompleteBtn = document.getElementById('modalCompleteBtn');
    const modalSnoozeBtn = document.getElementById('modalSnoozeBtn');

    function triggerAlarmModal(task) {
      activeAlarmTaskId = task.id;
      alarmModalTitle.textContent = task.title;
      alarmNagNotice.textContent = `⚠️ Nagging every ${task.nagIntervalMinutes} min until marked complete!`;
      alarmModal.classList.add('active');

      // Play beeps pattern immediately
      playBeepPattern();

      // Clear any prior interval
      if (alarmAudioInterval) clearInterval(alarmAudioInterval);

      // Repeat sound chime every 10 seconds while modal is in front of user
      alarmAudioInterval = setInterval(() => {
        if (activeAlarmTaskId) {
          playBeepPattern();
        }
      }, 10000);

      // Send system notification if permitted
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`Nagging: ${task.title}`, {
          body: `Tap to mark completed and stop repeating reminders.`,
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text y="20" font-size="20">🔔</text></svg>',
          tag: task.id
        });
      }
    }

    function stopAlarmModal() {
      activeAlarmTaskId = null;
      alarmModal.classList.remove('active');
      if (alarmAudioInterval) {
        clearInterval(alarmAudioInterval);
        alarmAudioInterval = null;
      }
    }

    modalCompleteBtn.addEventListener('click', () => {
      if (activeAlarmTaskId) {
        completeTask(activeAlarmTaskId);
      }
    });

    modalSnoozeBtn.addEventListener('click', () => {
      if (activeAlarmTaskId) {
        snoozeTask(activeAlarmTaskId, 5);
      }
    });

    // --- Background Nagging Loop (Checks every 3 seconds) ---
    setInterval(() => {
      const now = Date.now();
      let shouldNagTask = null;

      tasks.forEach(task => {
        if (!task.completed && task.dueDate <= now) {
          // Check if it's time to nag
          const intervalMs = task.nagIntervalMinutes * 60000;
          if (now - task.lastNaggedAt >= intervalMs) {
            task.lastNaggedAt = now;
            shouldNagTask = task;
          }
        }
      });

      if (shouldNagTask && !activeAlarmTaskId) {
        saveTasks();
        renderTasks();
        triggerAlarmModal(shouldNagTask);
      } else {
        // Just update UI timer badges
        renderTasks(false);
      }
    }, 3000);

    // --- Render Task Cards ---
    function renderTasks(fullRebuild = true) {
      const container = document.getElementById('taskList');
      const now = Date.now();

      const filtered = tasks.filter(t => currentTab === 'active' ? !t.completed : t.completed);

      if (filtered.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div style="font-size: 40px; margin-bottom: 8px;">${currentTab === 'active' ? '📋' : '🎉'}</div>
            <div style="font-weight: 600;">No ${currentTab} reminders</div>
            <div style="font-size: 0.85rem; margin-top: 4px;">${currentTab === 'active' ? 'Speak into the mic above to create a nag reminder!' : 'Completed tasks will appear here.'}</div>
          </div>
        `;
        return;
      }

      if (!fullRebuild && container.children.length === filtered.length) {
        // Light update of timestamps without destroying DOM focus
        filtered.forEach((task, idx) => {
          const card = container.children[idx];
          if (card) {
            const isNagging = !task.completed && task.dueDate <= now;
            if (isNagging && !card.classList.contains('nagging')) {
              card.classList.add('nagging');
            } else if (!isNagging && card.classList.contains('nagging')) {
              card.classList.remove('nagging');
            }
          }
        });
        return;
      }

      container.innerHTML = '';
      filtered.forEach(task => {
        const isNagging = !task.completed && task.dueDate <= now;
        const dueFormatted = new Date(task.dueDate).toLocaleString([], {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        const card = document.createElement('div');
        card.className = `task-card ${isNagging ? 'nagging' : ''}`;

        card.innerHTML = `
          <div class="task-top">
            <div class="task-title">${escapeHtml(task.title)}</div>
            <div class="task-status ${task.completed ? 'status-completed' : (isNagging ? 'status-nagging' : 'status-scheduled')}">
              ${task.completed ? 'Completed' : (isNagging ? '🔔 Nagging Active' : 'Scheduled')}
            </div>
          </div>

          <div class="task-details">
            <div class="task-detail-item">
              <span>📅</span> ${task.completed ? 'Finished: ' + new Date(task.completedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Due: ' + dueFormatted}
            </div>
            ${!task.completed ? `
              <div class="task-detail-item">
                <span>🔁</span> Repeats every ${task.nagIntervalMinutes} min
              </div>
            ` : ''}
          </div>

          <div class="task-actions">
            ${!task.completed ? `
              <button class="btn btn-success btn-sm" onclick="completeTask('${task.id}')">
                ✓ Mark Completed
              </button>
              <button class="btn btn-outline btn-sm" onclick="snoozeTask('${task.id}', 10)">
                +10m Snooze
              </button>
            ` : `
              <button class="btn btn-outline btn-sm" onclick="reactivateTask('${task.id}')">
                ↩ Re-open
              </button>
            `}
            <button class="btn btn-outline btn-sm" style="margin-left: auto; color: var(--danger);" onclick="deleteTask('${task.id}')">
              🗑
            </button>
          </div>
        `;
        container.appendChild(card);
      });
    }

    function reactivateTask(id) {
      const task = tasks.find(t => t.id === id);
      if (task) {
        task.completed = false;
        task.completedAt = null;
        task.dueDate = Date.now() + 5 * 60000;
        saveTasks();
        renderTasks();
      }
    }

    function escapeHtml(str) {
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    // --- Tab Switching ---
    const tabActive = document.getElementById('tabActive');
    const tabCompleted = document.getElementById('tabCompleted');

    tabActive.addEventListener('click', () => {
      currentTab = 'active';
      tabActive.classList.add('active');
      tabCompleted.classList.remove('active');
      renderTasks();
    });

    tabCompleted.addEventListener('click', () => {
      currentTab = 'completed';
      tabCompleted.classList.add('active');
      tabActive.classList.remove('active');
      renderTasks();
    });

    // --- Sound Tester ---
    document.getElementById('testSoundBtn').addEventListener('click', () => {
      initAudio();
      playBeepPattern();
    });

    // Init display
    updateCounts();
    renderTasks();