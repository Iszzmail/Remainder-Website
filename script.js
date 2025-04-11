document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const taskForm = document.getElementById('task-form');
    const taskListDiv = document.getElementById('task-list');
    const taskNameInput = document.getElementById('task-name');
    const timeInputsContainer = document.getElementById('time-inputs-container');
    const addTimeBtn = document.getElementById('add-time-btn');
    const taskRecurrenceInput = document.getElementById('task-recurrence');
    const taskRepeatInput = document.getElementById('task-repeat');
    const taskSoundInput = document.getElementById('task-sound');
    const taskColorInput = document.getElementById('task-color');
    const taskImageInput = document.getElementById('task-image');

    // --- Global State ---
    let tasks = [];
    let reminderIntervalId = null;
    let repeatTimers = {};

    // --- Web Audio API Setup --- // ** ENHANCED **
    let audioContext;
    const audioBuffers = {}; // Cache for decoded audio data
    let isAudioContextInitialized = false; // Flag to track initialization

    // Initialize AudioContext robustly on first user interaction
    function initAudioContext() {
        if (isAudioContextInitialized) return audioContext; // Already done

        if (window.AudioContext || window.webkitAudioContext) {
            if (!audioContext) {
                try {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    // Check state right after creation
                    if (audioContext.state === 'suspended') {
                        // Resume requires user gesture, but we might be *in* one now
                        audioContext.resume().then(() => {
                            console.log("AudioContext resumed successfully during init.");
                            isAudioContextInitialized = true;
                        }).catch(e => console.error("Error resuming AudioContext during init:", e));
                    } else {
                         console.log("AudioContext initialized in state:", audioContext.state);
                         isAudioContextInitialized = true;
                    }
                } catch(e) {
                    console.error("Web Audio API could not be initialized.", e);
                    alert("Audio playback might not work on this browser.");
                }
            } else {
                 isAudioContextInitialized = true; // It existed already
            }
        } else {
             console.warn("Web Audio API is not supported in this browser.");
             alert("Sorry, audio playback is not supported on this browser.");
        }
        return audioContext;
    }

    // Try initializing on common user interactions (run only once)
    const initAudioEvents = ['mousedown', 'keydown', 'touchend', 'click'];
    let initListenerAdded = false;
    function setupAudioInitListeners() {
        if (initListenerAdded) return;
         const initOnce = () => {
            initAudioContext();
            // Remove listeners after first interaction
            initAudioEvents.forEach(event => {
                 document.body.removeEventListener(event, initOnce);
            });
            initListenerAdded = true; // Prevent re-adding
             console.log("Audio Initializing Listeners Removed");
         };
         initAudioEvents.forEach(event => {
             document.body.addEventListener(event, initOnce, { once: true, capture: true }); // Use capture and once
         });
        console.log("Audio Initializing Listeners Added");
    }
    setupAudioInitListeners(); // Set up listeners on script load


    // Function to load, decode, and play a sound ** ENHANCED **
    async function playSound(soundFilename) {
        // Ensure context is initialized - try again if not done yet
        const context = initAudioContext();
        if (!context || !soundFilename || soundFilename === 'none') {
            console.log('AudioContext not available or no sound selected.');
            return;
        }

        // Crucial: Resume context if suspended (might happen due to inactivity)
        if (context.state === 'suspended') {
            try {
                await context.resume();
                console.log("AudioContext resumed for playback.");
            } catch (e) {
                 console.error("Error resuming AudioContext before playback:", e);
                 // Don't proceed if resume fails
                 return;
            }
        }
        // Double check state after trying resume
        if (context.state !== 'running') {
             console.warn("AudioContext is not running, cannot play sound.");
             return;
        }


        const soundUrl = `audio/${soundFilename}`;

        try {
            let buffer;
            // Check cache
            if (audioBuffers[soundUrl]) {
                buffer = audioBuffers[soundUrl];
                console.log(`Playing cached sound: ${soundUrl}`);
            } else {
                // Fetch and decode
                console.log(`Workspaceing and decoding sound: ${soundUrl}`);
                const response = await fetch(soundUrl);
                if (!response.ok) {
                    // Log specific error for file not found
                    if(response.status === 404) {
                         console.error(`Sound file not found at ${soundUrl}. Make sure it exists in the 'audio' folder.`);
                         alert(`Sound file '${soundFilename}' not found. Please check the 'audio' folder.`);
                    } else {
                         throw new Error(`HTTP error! status: ${response.status} for ${soundUrl}`);
                    }
                    return; // Stop if fetch failed
                }
                const arrayBuffer = await response.arrayBuffer();
                // Use Promise-based decodeAudioData
                buffer = await context.decodeAudioData(arrayBuffer);
                audioBuffers[soundUrl] = buffer; // Cache the decoded data
                 console.log(`Sound decoded and cached: ${soundUrl}`);
            }

            // Create buffer source and play
            const source = context.createBufferSource();
            source.buffer = buffer;
            source.connect(context.destination);
            source.start(0); // Play immediately
             console.log(`Sound started: ${soundUrl}`);

        } catch (error) {
            console.error(`Error loading or playing sound ${soundUrl}:`, error);
            // Provide more context for decoding errors
            if (error.message.includes('decodeAudioData')) {
                 alert(`Could not decode sound file: '${soundFilename}'. It might be corrupted or an unsupported format.`);
            } else if (!error.message.includes('HTTP')) { // Don't alert again for HTTP errors already handled
                 alert(`An error occurred trying to play sound: ${soundFilename}.`);
            }
        }
    }
    // --- END AUDIO SECTION ---

    // --- Notification Permission (No change) ---
    function requestNotificationPermission() {
        if (!("Notification" in window)) {
            console.log("This browser does not support desktop notification");
            return;
        }
        if (Notification.permission === "granted") {
            startReminderChecks();
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then((permission) => {
                if (permission === "granted") {
                    new Notification("Awesome!", { body: "Task notifications enabled!", icon: 'icon.png' });
                     startReminderChecks();
                } else {
                    alert("Notifications denied. You won't get reminders.");
                }
            });
        } else {
             alert("Notifications blocked. Enable in browser settings for reminders.");
        }
    }

    // --- Task Data Management ---
    function loadTasks() {
        const storedTasks = localStorage.getItem('comicTasks');
        taskListDiv.innerHTML = '';
        tasks = [];
        if (storedTasks) {
            try {
                const parsedTasks = JSON.parse(storedTasks);
                tasks = parsedTasks.map(task => ({
                    id: task.id || Date.now().toString() + Math.random().toString(16).slice(2),
                    name: task.name || 'Unnamed Task',
                    reminderTimes: task.reminderTimes || (task.time ? [task.time] : []),
                    recurrence: task.recurrence || 'daily',
                    repeatInterval: task.repeatInterval || 0,
                    sound: task.sound || 'none',
                    color: task.color || '#3498db',
                    imageUrl: task.imageUrl || '',
                    nextReminderTime: task.nextReminderTime || null,
                    isCompletedForPeriod: task.isCompletedForPeriod || false
                }));
                tasks.forEach(task => {
                    if (task.time) delete task.time;
                    calculateAndSetNextReminderTime(task);
                    renderTask(task);
                });
            } catch (e) {
                 console.error("Error parsing tasks:", e);
                 localStorage.removeItem('comicTasks');
                 alert("Error loading tasks. Resetting list.");
            }
        }
        console.log("Tasks loaded:", tasks);
        requestNotificationPermission();
    }

    function saveTasks() {
        try {
            localStorage.setItem('comicTasks', JSON.stringify(tasks));
        } catch (e) {
            console.error("Error saving tasks:", e);
        }
    }

     // --- Task Rendering ---
     function renderTask(task) {
        const taskItem = document.createElement('div');
        taskItem.classList.add('task-item');
        taskItem.dataset.id = task.id;
        taskItem.style.setProperty('--task-color', task.color);

        if (task.recurrence === 'none' && !task.nextReminderTime && task.isCompletedForPeriod) {
             taskItem.classList.add('completed');
        }

        let imageHTML = '';
        if (task.imageUrl) {
            imageHTML = `<img src="${task.imageUrl}" alt="${task.name}" onerror="this.style.display='none'; console.warn('Image load error: ${task.imageUrl}')">`;
        }

        let timesListHTML = '<ul class="times-list">';
        task.reminderTimes?.forEach(t => { timesListHTML += `<li>${t || 'N/A'}</li>`; });
        if (!task.reminderTimes || task.reminderTimes.length === 0) timesListHTML += '<li>No times</li>';
        timesListHTML += '</ul>';

        const nextReminderDate = task.nextReminderTime ? new Date(task.nextReminderTime) : null;
        const nextTimeString = nextReminderDate ? nextReminderDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'None';
        const nextDateString = nextReminderDate ? nextReminderDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric'}) : '';
        const soundDisplayName = task.sound && task.sound !== 'none' ? task.sound.split('.')[0].replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'None';

        taskItem.innerHTML = `
            ${imageHTML}
            <h3>${task.name}</h3>
            <p><strong>Remind At:</strong></p> ${timesListHTML}
            <p><strong>Frequency:</strong> ${task.recurrence === 'daily' ? 'Every Day' : 'Just Once'}</p>
            <p><strong>Sound:</strong> ${soundDisplayName}</p>
            ${task.repeatInterval > 0 ? `<p><strong>Repeat Delay:</strong> ${task.repeatInterval} min</p>` : ''}
            <p><strong>Next Up:</strong> ${nextDateString} ${nextTimeString} </p>
            <div class="task-actions">
                 <button class="btn complete-btn" ${(task.recurrence === 'none' && !task.nextReminderTime && task.isCompletedForPeriod) ? 'disabled' : ''}>✔️ Done Current</button>
                <button class="btn delete-btn">❌ Delete</button>
            </div>`;

        const existingItem = taskListDiv.querySelector(`.task-item[data-id="${task.id}"]`);
        if (existingItem) {
            taskListDiv.replaceChild(taskItem, existingItem);
        } else {
            // Append new items smoothly
             taskItem.style.opacity = '0'; // Start hidden for animation
            taskListDiv.appendChild(taskItem);
             // Force reflow maybe needed for animation trigger, but usually not
             // requestAnimationFrame(() => { taskItem.style.opacity = '1'; });
        }
     }


    // --- Add/Remove Time Inputs (No Change) ---
     function addTimeInput() {
        const newTimeGroup = document.createElement('div');
        newTimeGroup.classList.add('time-input-group');
        newTimeGroup.innerHTML = `<input type="time" class="task-time-input"><button type="button" class="btn remove-time-btn time-btn">-</button>`;
        timeInputsContainer.appendChild(newTimeGroup);
     }
     addTimeBtn.addEventListener('click', addTimeInput);
     timeInputsContainer.addEventListener('click', (event) => {
        if (event.target.classList.contains('remove-time-btn')) {
             if (timeInputsContainer.querySelectorAll('.time-input-group').length > 1) {
                event.target.closest('.time-input-group').remove();
             } else {
                 alert("ZAP! Need at least one time!");
             }
        }
     });


    // --- Add New Task ---
    function addTask(event) {
        event.preventDefault();
        const reminderTimes = Array.from(timeInputsContainer.querySelectorAll('.task-time-input')).map(input => input.value).filter(Boolean);
        if (!taskNameInput.value || reminderTimes.length === 0) {
            alert("WHAM! Need name and at least one time!");
            return;
        }
        const newTask = {
            id: Date.now().toString(36) + Math.random().toString(36).substring(2), // Robust ID
            name: taskNameInput.value.trim(),
            reminderTimes: reminderTimes,
            recurrence: taskRecurrenceInput.value,
            repeatInterval: parseInt(taskRepeatInput.value, 10) || 0,
            sound: taskSoundInput.value,
            color: taskColorInput.value,
            imageUrl: taskImageInput.value.trim(),
            nextReminderTime: null,
            isCompletedForPeriod: false
        };
        calculateAndSetNextReminderTime(newTask);
        tasks.push(newTask);
        saveTasks();
        renderTask(newTask);
        taskForm.reset();
        timeInputsContainer.innerHTML = `<div class="time-input-group"><input type="time" class="task-time-input" required></div>`;
        taskColorInput.value = '#3498db';
        taskSoundInput.value = 'none';
    }

     // --- Calculate Next Reminder Time (No Change) ---
     function calculateAndSetNextReminderTime(task) {
        const potentialTimes = [];
        const now = new Date();
        const nowTs = now.getTime();
        if (!task.reminderTimes || task.reminderTimes.length === 0) {
             task.nextReminderTime = null;
             task.isCompletedForPeriod = false; return;
        }
        task.reminderTimes.forEach(timeStr => {
            if (!timeStr || !timeStr.includes(':')) return;
            const [hours, minutes] = timeStr.split(':').map(Number);
            if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return;
            let todayDate = new Date(); todayDate.setHours(hours, minutes, 0, 0);
            if (todayDate.getTime() > nowTs) potentialTimes.push(todayDate);
            if (task.recurrence === 'daily') {
                let tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
                tomorrowDate.setHours(hours, minutes, 0, 0); potentialTimes.push(tomorrowDate);
            }
        });
        potentialTimes.sort((a, b) => a.getTime() - b.getTime());
        const earliestNextDate = potentialTimes.find(date => date.getTime() > nowTs);
        task.nextReminderTime = earliestNextDate ? earliestNextDate.toISOString() : null;
        task.isCompletedForPeriod = false;
        // console.log(`Next reminder for ${task.name}: ${task.nextReminderTime || 'None'}`);
    }

     // --- Handle Task Actions (Complete/Delete) ---
     function handleTaskAction(event) {
        const targetButton = event.target;
        const taskItem = targetButton.closest('.task-item');
        if (!taskItem) return;
        const taskId = taskItem.dataset.id;
        const taskIndex = tasks.findIndex(task => task.id === taskId);
        if (taskIndex === -1) return;
        const task = tasks[taskIndex];

        if (targetButton.classList.contains('delete-btn')) {
            if (confirm(`Delete "${task.name}"?`)) {
                clearTimeout(repeatTimers[taskId]); delete repeatTimers[taskId];
                tasks.splice(taskIndex, 1); saveTasks();
                // Smooth removal animation
                 taskItem.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                 taskItem.style.opacity = '0';
                 taskItem.style.transform = 'scale(0.8)';
                 setTimeout(() => taskItem.remove(), 300); // Remove after animation
            }
        } else if (targetButton.classList.contains('complete-btn') && !targetButton.disabled) {
            task.isCompletedForPeriod = true;
            clearTimeout(repeatTimers[taskId]); delete repeatTimers[taskId];
            saveTasks();
            targetButton.disabled = true; targetButton.textContent = '✔️ Done';
            if (task.recurrence === 'none' && !task.nextReminderTime) {
                taskItem.classList.add('completed');
            } else {
                 taskItem.style.opacity = '0.8';
                 setTimeout(() => {
                      if (taskItem && task.nextReminderTime && tasks.find(t => t.id === taskId)) { // Check task still exists
                          taskItem.style.opacity = '1';
                          targetButton.disabled = false;
                          targetButton.textContent = '✔️ Done Current';
                      }
                 }, 3000);
            }
        }
    }

    // --- Reminder Checking & Notifications ---
    function checkReminders() {
        const now = new Date();
        let changesMade = false;
        tasks.forEach((task) => {
            if (!task.nextReminderTime || task.isCompletedForPeriod) return;
            const reminderTime = new Date(task.nextReminderTime);
            if (reminderTime <= now) {
                const specificTime = reminderTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                console.log(`Reminder DUE: ${task.name} at ${specificTime}`);
                // *** Play sound FIRST ***
                playSound(task.sound).then(() => {
                    // Show notification slightly after sound starts (optional)
                     showNotification(task, specificTime);
                }).catch(() => {
                    // Still show notification even if sound fails
                     showNotification(task, specificTime);
                });


                task.isCompletedForPeriod = false; // Mark as pending user action

                clearTimeout(repeatTimers[task.id]);
                if (task.repeatInterval > 0) {
                    repeatTimers[task.id] = setTimeout(() => {
                        const currentTaskState = tasks.find(t => t.id === task.id);
                        if (currentTaskState && !currentTaskState.isCompletedForPeriod) {
                           const originalReminderTime = new Date(task.nextReminderTime);
                            if (originalReminderTime <= new Date()) {
                                playSound(task.sound).then(() => { // Play sound on repeat too
                                    showNotification(task, specificTime, true);
                                }).catch(() => { showNotification(task, specificTime, true);});
                            }
                        }
                        delete repeatTimers[task.id];
                    }, task.repeatInterval * 60 * 1000);
                }
                calculateAndSetNextReminderTime(task); // Find the next actual slot
                changesMade = true;
            }
        });
        if (changesMade) {
             saveTasks();
             taskListDiv.innerHTML = ''; // Batch update UI
             tasks.forEach(renderTask);
        }
    }

    // --- Show Notification ---
    function showNotification(task, specificTime, isRepeat = false) {
        if (Notification.permission !== "granted") return;
        const title = isRepeat ? `⏰ Reminder: ${task.name}` : `🔔 Task Due: ${task.name}`;
        const options = {
            body: `It's time for: ${task.name} (at ${specificTime})`,
            icon: task.imageUrl || 'icon.png', // Add a default icon.png?
            tag: task.id + "_" + specificTime.replace(':', ''),
            renotify: isRepeat, requireInteraction: isRepeat,
            badge: 'badge.png' // Optional: Small badge icon
        };
        try {
            const notification = new Notification(title, options);
            if (!isRepeat) setTimeout(() => notification.close(), 20000);
            notification.onclick = () => {
                window.focus();
                const taskElement = document.querySelector(`.task-item[data-id="${task.id}"]`);
                taskElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                notification.close();
            };
        } catch (e) { console.error("Notification error:", e); }
    }

     // --- Start Reminder Checks ---
     function startReminderChecks() {
        if (!reminderIntervalId && Notification.permission === "granted") {
             console.log("Starting reminder checks (every 20 seconds)."); // Check slightly more often?
             reminderIntervalId = setInterval(checkReminders, 20 * 1000);
             checkReminders(); // Initial check
        } else { /* Log if not started */ }
    }

    // --- Global Event Listeners ---
    taskForm.addEventListener('submit', addTask);
    taskListDiv.addEventListener('click', handleTaskAction);

    // --- Initial Load ---
    loadTasks();

}); // End DOMContentLoaded