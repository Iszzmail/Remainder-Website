/* script.js */

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const showFormBtn = document.getElementById('show-form-btn'); // Button to show form
    const addTaskContainer = document.getElementById('add-task-container'); // Container for the form section
    const taskForm = document.getElementById('task-form');
    const cancelAddBtn = document.getElementById('cancel-add-btn'); // Cancel button in form

    const personalTasksDiv = document.getElementById('personal-tasks'); // Div for personal tasks
    const workTasksDiv = document.getElementById('work-tasks');     // Div for work tasks
    const mainTaskListContainer = document.getElementById('task-list'); // Container for both category lists

    // Keep references to form inputs
    const taskNameInput = document.getElementById('task-name');
    const timeInputsContainer = document.getElementById('time-inputs-container');
    const addTimeBtn = document.getElementById('add-time-btn');
    const taskRecurrenceInput = document.getElementById('task-recurrence');
    const taskRepeatInput = document.getElementById('task-repeat');
    const taskSoundInput = document.getElementById('task-sound');
    const taskColorInput = document.getElementById('task-color');
    const taskImageInput = document.getElementById('task-image');

    // --- Global State ---
    let tasks = []; // Array to hold all task objects
    let reminderIntervalId = null; // ID for the main checkReminders interval
    let repeatTimers = {}; // Object to store setTimeout IDs for repeat reminders {taskId: timerId}

    // --- Web Audio API Setup --- // ** ENHANCED **
    let audioContext;
    const audioBuffers = {}; // Cache for decoded audio data
    let isAudioContextInitialized = false; // Flag to track initialization

    // Initialize AudioContext robustly on first user interaction
    function initAudioContext() {
        if (isAudioContextInitialized && audioContext) return audioContext; // Already done

        if (window.AudioContext || window.webkitAudioContext) {
            if (!audioContext) {
                try {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                     console.log("AudioContext created. Initial state:", audioContext.state);
                    // Immediately try to resume if suspended, might work if called during interaction handling
                    if (audioContext.state === 'suspended') {
                        audioContext.resume().then(() => {
                            console.log("AudioContext resumed successfully during init.");
                            isAudioContextInitialized = true;
                        }).catch(e => {
                            console.error("Error resuming AudioContext during init (may need further interaction):", e);
                            // We still set initialized to true, but playback might fail until user interacts more
                            isAudioContextInitialized = true;
                        });
                    } else {
                         isAudioContextInitialized = true;
                    }
                } catch(e) {
                    console.error("Web Audio API could not be initialized.", e);
                    alert("Audio playback might not work on this browser.");
                }
            } else {
                 // If context exists, ensure flag is set
                 isAudioContextInitialized = true;
            }
        } else {
             console.warn("Web Audio API is not supported in this browser.");
             // Optionally disable sound features if not supported
        }
        return audioContext;
    }

    // Try initializing on common user interactions (run only once)
    const initAudioEvents = ['mousedown', 'keydown', 'touchend', 'click'];
    let initListenerAdded = false;
    function setupAudioInitListeners() {
        if (initListenerAdded) return;
         const initOnce = () => {
            console.log(`User interaction detected (${event.type}), attempting to init/resume AudioContext.`);
            initAudioContext(); // Call init on interaction
            // Try resuming again explicitly on interaction if it was suspended
             if (audioContext && audioContext.state === 'suspended') {
                 audioContext.resume().then(() => console.log("AudioContext resumed on interaction."))
                                     .catch(e => console.error("Error resuming on interaction:", e));
             }

            // Remove listeners after first interaction attempt
            initAudioEvents.forEach(event => {
                 document.body.removeEventListener(event, initOnce, { capture: true });
            });
            initListenerAdded = true;
            console.log("Audio Initializing Listeners Removed.");
         };
         initAudioEvents.forEach(event => {
             // Use capture true to catch interaction early, once true to self-remove
             document.body.addEventListener(event, initOnce, { once: true, capture: true });
         });
        console.log("Audio Initializing Listeners Added (will run once on first interaction).");
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
            console.log("AudioContext is suspended, attempting to resume...");
            try {
                await context.resume();
                console.log("AudioContext resumed for playback.");
            } catch (e) {
                 console.error("Error resuming AudioContext before playback:", e);
                 alert("Could not play sound. Browser interaction might be needed again.");
                 return; // Don't proceed if resume fails
            }
        }

        // Double check state after trying resume
        if (context.state !== 'running') {
             console.warn(`AudioContext is not running (state: ${context.state}), cannot play sound.`);
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
                    if(response.status === 404) {
                         console.error(`Sound file not found at ${soundUrl}. Make sure it exists in the 'audio' folder.`);
                         alert(`Sound file '${soundFilename}' not found. Please check the 'audio' folder.`);
                    } else {
                         throw new Error(`HTTP error! status: ${response.status} for ${soundUrl}`);
                    }
                    return; // Stop if fetch failed
                }
                const arrayBuffer = await response.arrayBuffer();
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
            if (error.message.includes('decodeAudioData')) {
                 alert(`Could not decode sound file: '${soundFilename}'. It might be corrupted or an unsupported format.`);
            } else if (!error.message.includes('HTTP')) { // Don't alert again for HTTP errors already handled
                 alert(`An error occurred trying to play sound: ${soundFilename}.`);
            }
        }
    }
    // --- END AUDIO SECTION ---


    // --- Form Visibility Toggle ---
    function toggleAddTaskForm(show) {
        if (show) {
            addTaskContainer.classList.remove('hidden');
            showFormBtn.textContent = '🙅‍♀️ Cancel Adding Task';
            addTaskContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            addTaskContainer.classList.add('hidden');
            showFormBtn.textContent = '💥 Add New Task 💥';
            taskForm.reset(); // Reset form fields
            // Reset dynamic parts of the form
            timeInputsContainer.innerHTML = `<div class="time-input-group"><input type="time" class="task-time-input" required></div>`;
            taskColorInput.value = '#3498db';
            taskSoundInput.value = 'none';
            const personalRadio = taskForm.querySelector('input[name="task-category"][value="personal"]');
            if (personalRadio) personalRadio.checked = true; // Default category
        }
    }

    showFormBtn.addEventListener('click', () => {
        const isHidden = addTaskContainer.classList.contains('hidden');
        toggleAddTaskForm(isHidden);
    });

    cancelAddBtn.addEventListener('click', () => {
        toggleAddTaskForm(false); // Always hide on cancel
    });


    // --- Notification Permission ---
    function requestNotificationPermission() {
        if (!("Notification" in window)) {
            console.log("This browser does not support desktop notification");
            return; // Exit if not supported
        }
        // Check current permission status
        if (Notification.permission === "granted") {
             console.log("Notification permission already granted.");
             startReminderChecks(); // Start checking if permission exists
        } else if (Notification.permission !== "denied") {
            // Ask for permission only if not denied (state is 'default')
            console.log("Requesting notification permission...");
            Notification.requestPermission().then((permission) => {
                console.log("Permission request result:", permission);
                if (permission === "granted") {
                    console.log("Notification permission granted.");
                    new Notification("Awesome!", { body: "Task notifications enabled!", icon: 'icon.png' });
                    startReminderChecks(); // Start checking now
                } else {
                    console.log("Notification permission denied by user.");
                    // Don't alert here, user explicitly denied
                }
            });
        } else {
            // Permission is denied, cannot ask again without user intervention in browser settings
            console.warn("Notification permission was previously denied by the user for this site.");
            // Optionally display a non-blocking message in the UI instead of an alert
        }
    }

    // --- Task Data Management ---
    function loadTasks() {
        const storedTasks = localStorage.getItem('comicTasks');
        personalTasksDiv.innerHTML = ''; // Clear display lists
        workTasksDiv.innerHTML = '';
        tasks = []; // Reset internal array

        if (storedTasks) {
            try {
                const parsedTasks = JSON.parse(storedTasks);
                // Use map for safer processing and ensuring all properties exist
                tasks = parsedTasks.map(task => ({
                    id: task.id || Date.now().toString(36) + Math.random().toString(36).substring(2),
                    name: task.name || 'Unnamed Task',
                    category: task.category || 'personal', // Default category
                    reminderTimes: task.reminderTimes || [],
                    recurrence: task.recurrence || 'daily',
                    repeatInterval: typeof task.repeatInterval === 'number' ? task.repeatInterval : 0, // Ensure number
                    sound: task.sound || 'none',
                    color: task.color || '#3498db',
                    imageUrl: task.imageUrl || '',
                    nextReminderTime: task.nextReminderTime || null,
                    isCompletedForPeriod: typeof task.isCompletedForPeriod === 'boolean' ? task.isCompletedForPeriod : false // Ensure boolean
                }));

                tasks.forEach(task => {
                    calculateAndSetNextReminderTime(task); // Recalculate next time
                    renderTask(task); // Render into the correct category list
                });

            } catch (e) {
                 console.error("Error parsing tasks from localStorage:", e);
                 localStorage.removeItem('comicTasks'); // Clear potentially corrupted data
                 alert("Error loading tasks. Task list has been reset.");
            }
        }
        console.log("Tasks loaded:", tasks.length);
        requestNotificationPermission(); // Check/request permission after loading tasks
    }

    function saveTasks() {
        try {
            localStorage.setItem('comicTasks', JSON.stringify(tasks));
             // console.log("Tasks saved."); // Can be noisy
        } catch (e) {
            console.error("Error saving tasks to localStorage:", e);
            alert("Could not save tasks. Local storage might be full or disabled.");
        }
    }

     // --- Task Rendering (Handles Categories) ---
     function renderTask(task) {
        const taskItem = document.createElement('div');
        taskItem.classList.add('task-item');
        taskItem.classList.add(task.category || 'personal'); // Add category class
        taskItem.dataset.id = task.id;
        taskItem.style.setProperty('--task-color', task.color);

        // Add 'completed' class only if the task is non-recurring, finished, and marked complete
        if (task.recurrence === 'none' && !task.nextReminderTime && task.isCompletedForPeriod) {
             taskItem.classList.add('completed');
        }

        let imageHTML = '';
        if (task.imageUrl) {
             // Added basic error handling for the image
            imageHTML = `<img src="${task.imageUrl}" alt="${task.name}" loading="lazy" onerror="this.style.display='none'; console.warn('Image load error: ${task.imageUrl}')">`;
        }

        let timesListHTML = '<ul class="times-list">';
        task.reminderTimes?.forEach(t => { timesListHTML += `<li>${t || 'N/A'}</li>`; });
        if (!task.reminderTimes || task.reminderTimes.length === 0) timesListHTML += '<li>No times</li>';
        timesListHTML += '</ul>';

        const nextReminderDate = task.nextReminderTime ? new Date(task.nextReminderTime) : null;
        const nextTimeString = nextReminderDate ? nextReminderDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'None';
        const nextDateString = nextReminderDate ? nextReminderDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric'}) : '';
        const soundDisplayName = task.sound && task.sound !== 'none' ? task.sound.split('.')[0].replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'None';
        // Optional: Display Category on Card
        // const categoryDisplayName = (task.category || 'personal').replace(/\b\w/g, l => l.toUpperCase());

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

        // Append to the correct category list
        const targetList = (task.category === 'work') ? workTasksDiv : personalTasksDiv;

        // If the element already exists (e.g., from a re-render), replace it
        const existingItem = targetList.querySelector(`.task-item[data-id="${task.id}"]`);
         if (existingItem) {
             targetList.replaceChild(taskItem, existingItem);
         } else {
             // Append new items - Use animation defined in CSS
             targetList.appendChild(taskItem);
         }
     }


    // --- Add/Remove Time Inputs ---
     function addTimeInput() {
        const newTimeGroup = document.createElement('div');
        newTimeGroup.classList.add('time-input-group');
        newTimeGroup.innerHTML = `<input type="time" class="task-time-input"><button type="button" class="btn remove-time-btn time-btn">-</button>`;
        timeInputsContainer.appendChild(newTimeGroup);
     }
     addTimeBtn.addEventListener('click', addTimeInput);
     timeInputsContainer.addEventListener('click', (event) => { // Use delegation
        if (event.target.classList.contains('remove-time-btn')) {
             if (timeInputsContainer.querySelectorAll('.time-input-group').length > 1) {
                event.target.closest('.time-input-group').remove();
             } else {
                 alert("ZAP! Need at least one time!");
             }
        }
     });


    // --- Add New Task (Handles Category) ---
    function addTask(event) {
        event.preventDefault(); // Prevent page reload
        const reminderTimes = Array.from(timeInputsContainer.querySelectorAll('.task-time-input'))
                                .map(input => input.value)
                                .filter(Boolean); // Filter out empty strings

        const selectedCategory = taskForm.querySelector('input[name="task-category"]:checked')?.value || 'personal';

        if (!taskNameInput.value.trim() || reminderTimes.length === 0) {
            alert("WHAM! Need a task name and at least one reminder time!");
            return;
        }

        const newTask = {
            id: Date.now().toString(36) + Math.random().toString(36).substring(2), // More unique ID
            name: taskNameInput.value.trim(),
            category: selectedCategory, // Save category
            reminderTimes: reminderTimes,
            recurrence: taskRecurrenceInput.value,
            repeatInterval: parseInt(taskRepeatInput.value, 10) || 0,
            sound: taskSoundInput.value,
            color: taskColorInput.value,
            imageUrl: taskImageInput.value.trim(),
            nextReminderTime: null,
            isCompletedForPeriod: false
        };

        calculateAndSetNextReminderTime(newTask); // Calculate initial next time
        tasks.push(newTask);
        saveTasks();
        renderTask(newTask); // Render into the correct category list
        toggleAddTaskForm(false); // Hide form after successful add
    }

     // --- Calculate Next Reminder Time ---
     function calculateAndSetNextReminderTime(task) {
         const potentialTimes = [];
         const now = new Date();
         const nowTs = now.getTime(); // Current timestamp

         if (!task.reminderTimes || task.reminderTimes.length === 0) {
              task.nextReminderTime = null;
              task.isCompletedForPeriod = false;
              return; // No times defined
         }

         task.reminderTimes.forEach(timeStr => {
             if (!timeStr || !timeStr.includes(':')) return; // Skip invalid format
             const [hours, minutes] = timeStr.split(':').map(Number);
             if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return; // Skip invalid values

             // Candidate time for today
             let todayDate = new Date();
             todayDate.setHours(hours, minutes, 0, 0); // Set H, M, S, MS
             if (todayDate.getTime() > nowTs) { // Only consider if it's in the future *today*
                 potentialTimes.push(todayDate);
             }

             // Candidate time for tomorrow (only if recurrence is daily)
             if (task.recurrence === 'daily') {
                 let tomorrowDate = new Date();
                 tomorrowDate.setDate(tomorrowDate.getDate() + 1); // Move to tomorrow
                 tomorrowDate.setHours(hours, minutes, 0, 0);
                 potentialTimes.push(tomorrowDate); // Always add tomorrow's possibility
             }
         });

         // Sort potential times chronologically
         potentialTimes.sort((a, b) => a.getTime() - b.getTime());

         // Find the *earliest* unique time that is strictly in the future from now
         const earliestNextDate = potentialTimes.find(date => date.getTime() > nowTs);

         task.nextReminderTime = earliestNextDate ? earliestNextDate.toISOString() : null;
         task.isCompletedForPeriod = false; // Reset completion status

         // console.log(`Next reminder for ${task.name}: ${task.nextReminderTime || 'None'}`);
     }

     // --- Handle Task Actions (Complete/Delete) ---
     function handleTaskAction(event) {
        const targetButton = event.target.closest('button.btn'); // Find the clicked button
        if (!targetButton) return; // Exit if click wasn't on a button we care about

        const taskItem = targetButton.closest('.task-item');
        if (!taskItem) return; // Exit if button isn't inside a task item

        const taskId = taskItem.dataset.id;
        const taskIndex = tasks.findIndex(task => task.id === taskId);
        if (taskIndex === -1) {
            console.error("Task not found in array for ID:", taskId);
            return;
        }
        const task = tasks[taskIndex];

        // --- Delete Action ---
        if (targetButton.classList.contains('delete-btn')) {
            if (confirm(`Are you sure you want to delete task "${task.name}"?`)) {
                clearTimeout(repeatTimers[taskId]);
                delete repeatTimers[taskId];
                tasks.splice(taskIndex, 1); // Remove task from array
                saveTasks();
                // Animate removal
                taskItem.style.transition = 'opacity 0.3s ease, transform 0.3s ease, max-height 0.4s ease, padding 0.3s ease, margin 0.3s ease';
                taskItem.style.opacity = '0';
                taskItem.style.transform = 'scale(0.8)';
                taskItem.style.maxHeight = '0px';
                taskItem.style.paddingTop = '0';
                taskItem.style.paddingBottom = '0';
                taskItem.style.marginTop = '0';
                taskItem.style.marginBottom = '0';
                taskItem.style.borderWidth = '0'; // Hide border during collapse
                setTimeout(() => taskItem.remove(), 400); // Remove from DOM after animation
                console.log(`Task ${taskId} deleted.`);
            }
        }
        // --- Complete Action ---
        else if (targetButton.classList.contains('complete-btn') && !targetButton.disabled) {
            console.log(`Marking task ${taskId} (${task.name}) completed for this period.`);
            task.isCompletedForPeriod = true; // Mark done for NOW
            clearTimeout(repeatTimers[taskId]); // Stop repeats for this slot
            delete repeatTimers[taskId];
            saveTasks();

            // Update UI for current completion
            targetButton.disabled = true;
            targetButton.textContent = '✔️ Done';
            // If it's a 'Just Once' task and no next reminder, add permanent 'completed' class
            if (task.recurrence === 'none' && !task.nextReminderTime) {
                taskItem.classList.add('completed');
            } else {
                 // Add temporary feedback
                 taskItem.style.opacity = '0.7';
                 setTimeout(() => {
                     // Check task still exists before trying to revert style
                      const currentTask = tasks.find(t => t.id === taskId);
                      // Re-enable button only if a next reminder time exists and it's not permanently completed
                      if (taskItem && currentTask?.nextReminderTime && !taskItem.classList.contains('completed')) {
                          taskItem.style.opacity = '1';
                          targetButton.disabled = false;
                          targetButton.textContent = '✔️ Done Current';
                      } else if (taskItem && !taskItem.classList.contains('completed')){
                           // If no next time, but not permanently complete, just restore opacity
                           taskItem.style.opacity = '1';
                      }
                 }, 3000); // Reset visual feedback after 3 seconds
            }
        }
    }

    // --- Reminder Checking & Notifications ---
    function checkReminders() {
        const now = new Date();
        let changesMade = false; // Flag to batch save/re-render if next times change

        tasks.forEach((task) => {
            // Skip if no reminder scheduled OR if the current scheduled one is already marked done
            if (!task.nextReminderTime || task.isCompletedForPeriod) {
                return;
            }

            const reminderTime = new Date(task.nextReminderTime);

            // --- Main Reminder Check ---
            if (reminderTime <= now) {
                const specificTime = reminderTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                console.log(`Reminder DUE: ${task.name} at ${specificTime}`);

                // Play sound first, then show notification
                playSound(task.sound).finally(() => {
                    showNotification(task, specificTime);
                });

                // Mark as *pending* completion for this cycle (user must click 'Done')
                // Note: This gets immediately reset below if we calculate a next time.
                // The 'isCompletedForPeriod' flag now primarily controls if *this specific* due time gets processed again.
                // We rely on the 'Done' button click to truly mark it handled by the user.
                // task.isCompletedForPeriod = false; // No longer needed here, reset happens in calculate...

                // --- Repeat Logic ---
                clearTimeout(repeatTimers[task.id]); // Clear previous repeat timer for this task
                if (task.repeatInterval > 0) {
                    console.log(`Setting repeat timer for ${task.name} in ${task.repeatInterval} min.`);
                    repeatTimers[task.id] = setTimeout(() => {
                        // Check if task still exists and *still hasn't been marked complete* by the user
                        const currentTaskState = tasks.find(t => t.id === task.id);
                        if (currentTaskState && !currentTaskState.isCompletedForPeriod) {
                            const repeatCheckTime = new Date(task.nextReminderTime); // Time that triggered this repeat cycle
                            // If the next reminder time *still* matches the time this repeat was set for
                            // (meaning calculateAndSetNextReminderTime hasn't found a *later* time yet because 'Done' wasn't clicked)
                            if (repeatCheckTime <= new Date()) {
                                console.log(`Showing REPEAT for ${task.name} (${specificTime})`);
                                playSound(task.sound).finally(() => { // Play sound on repeat too
                                    showNotification(task, specificTime, true);
                                });
                                // **Important**: Re-schedule the *same* repeat timer if not completed
                                // This makes the repeat truly periodic until 'Done' is clicked.
                                if (currentTaskState.repeatInterval > 0) {
                                     // Re-set the timeout using the same logic
                                     clearTimeout(repeatTimers[task.id]); // Clear just in case
                                     repeatTimers[task.id] = setTimeout( /* ... recursive call structure needed or call outer function ... */ arguments.callee, task.repeatInterval * 60 * 1000);
                                     console.log(`Re-scheduling repeat timer for ${task.name}`);
                                }

                            } else {
                                console.log(`Repeat for ${task.name} (${specificTime}) skipped, main reminder time advanced.`);
                            }
                        } else {
                             console.log(`Repeat for ${task.name} (${specificTime}) skipped, task marked complete or removed.`);
                        }
                       // Don't delete timer ref if re-scheduling above; otherwise delete if done
                        // delete repeatTimers[task.id]; // Deleting prevents rescheduling in current structure
                    }, task.repeatInterval * 60 * 1000);
                }

                // *** Calculate the absolutely next time slot AFTER this one fired ***
                calculateAndSetNextReminderTime(task);
                changesMade = true; // Mark that task data (nextReminderTime) changed

            } // End if reminder time is due
        }); // End forEach task

        // If any task's nextReminderTime was updated, save and re-render
        if (changesMade) {
             saveTasks();
             // Efficiently re-render only the tasks whose nextReminderTime changed?
             // For simplicity now, re-rendering all is easier to manage with categories.
             personalTasksDiv.innerHTML = '';
             workTasksDiv.innerHTML = '';
             tasks.forEach(renderTask);
             console.log("Task list re-rendered due to time updates.");
        }
    }


    // --- Show Desktop Notification ---
    function showNotification(task, specificTime, isRepeat = false) {
        if (Notification.permission !== "granted") {
            console.warn("Notification permission not granted, cannot show notification.");
            return;
        }
        const title = isRepeat ? `⏰ Reminder: ${task.name}` : `🔔 Task Due: ${task.name}`;
        const options = {
            body: `It's time for: ${task.name} (at ${specificTime})`,
            icon: task.imageUrl || 'icons/icon-192.png', // Provide a default icon path
            tag: task.id + "_" + specificTime.replace(':', ''), // Unique tag per task/time
            renotify: isRepeat, // Allow repeats to re-alert
            requireInteraction: isRepeat, // Suggest notification stays until dismissed
            badge: 'icons/badge-72.png' // Optional: Small badge icon (ensure files exist)
        };
        try {
            const notification = new Notification(title, options);
            // Auto-close non-repeat notifications
            if (!isRepeat) {
                 setTimeout(() => notification.close(), 20000); // Close after 20 seconds
            }
            // Focus window and scroll to task on click
            notification.onclick = () => {
                window.focus();
                const taskElement = document.querySelector(`.task-item[data-id="${task.id}"]`);
                taskElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                notification.close(); // Close after click
            };
            notification.onerror = (err) => {
                 console.error("Notification API error:", err);
            };
        } catch (e) {
             console.error("Error creating notification:", e);
        }
    }

     // --- Start the Reminder Checking Interval ---
     function startReminderChecks() {
        if (!reminderIntervalId && Notification.permission === "granted") {
             console.log("Starting reminder checks (every 20 seconds).");
             // Check fairly frequently for responsiveness
             reminderIntervalId = setInterval(checkReminders, 20 * 1000); // Check every 20 seconds
             checkReminders(); // Initial check immediately
        } else if (Notification.permission !== "granted") {
             console.log("Reminder checks not started: Notification permission not granted.");
        } else {
             console.log("Reminder checks already running.");
        }
    }

    // --- Global Event Listeners ---
    taskForm.addEventListener('submit', addTask);
    // Use event delegation on the main task list container for clicks on task buttons
    mainTaskListContainer.addEventListener('click', handleTaskAction);

    // --- Initial Load ---
    loadTasks(); // Load tasks, render them, check permissions, and start interval if allowed

}); // End DOMContentLoaded wrapper