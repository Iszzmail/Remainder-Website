document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const showFormBtn = document.getElementById('show-form-btn'); // Button to show form
    const addTaskContainer = document.getElementById('add-task-container'); // Container for the form section
    const taskForm = document.getElementById('task-form');
    const cancelAddBtn = document.getElementById('cancel-add-btn'); // Cancel button in form

    const personalTasksDiv = document.getElementById('personal-tasks'); // Div for personal tasks
    const workTasksDiv = document.getElementById('work-tasks');     // Div for work tasks
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
    let tasks = [];
    let reminderIntervalId = null;
    let repeatTimers = {};

    // --- Web Audio API Setup ---
    let audioContext;
    const audioBuffers = {};
    let isAudioContextInitialized = false;
    // ... (initAudioContext, setupAudioInitListeners, playSound functions remain the same as previous version)
    function initAudioContext() { if (isAudioContextInitialized) return audioContext; if (window.AudioContext || window.webkitAudioContext) { if (!audioContext) { try { audioContext = new (window.AudioContext || window.webkitAudioContext)(); if (audioContext.state === 'suspended') { audioContext.resume().then(() => { console.log("AudioContext resumed."); isAudioContextInitialized = true; }).catch(e => console.error("Error resuming:", e)); } else { console.log("AudioContext state:", audioContext.state); isAudioContextInitialized = true; } } catch(e) { console.error("Audio init error:", e); alert("Audio playback fail."); } } else { isAudioContextInitialized = true; } } else { console.warn("Web Audio API not supported."); } return audioContext; }
    const initAudioEvents = ['mousedown', 'keydown', 'touchend', 'click']; let initListenerAdded = false; function setupAudioInitListeners() { if (initListenerAdded) return; const initOnce = () => { initAudioContext(); initAudioEvents.forEach(event => { document.body.removeEventListener(event, initOnce); }); initListenerAdded = true; console.log("Audio Init Listeners Removed"); }; initAudioEvents.forEach(event => { document.body.addEventListener(event, initOnce, { once: true, capture: true }); }); console.log("Audio Init Listeners Added"); } setupAudioInitListeners();
    async function playSound(soundFilename) { const context = initAudioContext(); if (!context || !soundFilename || soundFilename === 'none') return; if (context.state === 'suspended') { try { await context.resume(); } catch (e) { console.error("Resume error:", e); return; } } if (context.state !== 'running') { console.warn("AudioContext not running."); return; } const soundUrl = `audio/${soundFilename}`; try { let buffer; if (audioBuffers[soundUrl]) { buffer = audioBuffers[soundUrl]; } else { const response = await fetch(soundUrl); if (!response.ok) { if(response.status === 404) { console.error(`404: ${soundUrl}`); alert(`Sound '${soundFilename}' not found.`); } else { throw new Error(`HTTP ${response.status}`); } return; } const arrayBuffer = await response.arrayBuffer(); buffer = await context.decodeAudioData(arrayBuffer); audioBuffers[soundUrl] = buffer; } const source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination); source.start(0); } catch (error) { console.error(`Play sound error ${soundUrl}:`, error); if (error.message.includes('decode')) { alert(`Cannot decode sound: '${soundFilename}'.`); } } }


    // --- Form Visibility Toggle ---
    function toggleAddTaskForm(show) {
        if (show) {
            addTaskContainer.classList.remove('hidden');
            showFormBtn.textContent = '🙅‍♀️ Cancel Adding Task'; // Change button text
            // Scroll form into view smoothly (optional)
            addTaskContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            addTaskContainer.classList.add('hidden');
            showFormBtn.textContent = '💥 Add New Task 💥'; // Reset button text
            taskForm.reset(); // Optionally reset form on cancel
            timeInputsContainer.innerHTML = `<div class="time-input-group"><input type="time" class="task-time-input" required></div>`;// Reset time inputs
            taskColorInput.value = '#3498db';
            taskSoundInput.value = 'none';
            // Set default category back to personal
             const personalRadio = taskForm.querySelector('input[name="task-category"][value="personal"]');
             if (personalRadio) personalRadio.checked = true;
        }
    }

    showFormBtn.addEventListener('click', () => {
        const isHidden = addTaskContainer.classList.contains('hidden');
        toggleAddTaskForm(isHidden); // Show if hidden, hide if shown
    });

    cancelAddBtn.addEventListener('click', () => {
        toggleAddTaskForm(false); // Always hide on cancel
    });


    // --- Notification Permission ---
    function requestNotificationPermission() {
         if (!("Notification" in window)) { console.log("Notifications not supported"); return; }
         if (Notification.permission === "granted") { startReminderChecks(); }
         else if (Notification.permission !== "denied") { Notification.requestPermission().then(p => { if (p === "granted") { new Notification("Awesome!",{body:"Notifications enabled!"}); startReminderChecks(); } else { alert("Notifications denied."); } }); }
         else { /* Already denied - handled in loadTasks maybe? Or just silent */ console.warn("Notifications previously denied by user."); }
    }

    // --- Task Data Management ---
    function loadTasks() {
        const storedTasks = localStorage.getItem('comicTasks');
        // Clear both lists before loading
        personalTasksDiv.innerHTML = '';
        workTasksDiv.innerHTML = '';
        tasks = []; // Reset tasks array

        if (storedTasks) {
            try {
                const parsedTasks = JSON.parse(storedTasks);
                tasks = parsedTasks.map(task => ({
                    id: task.id || Date.now().toString(36) + Math.random().toString(36).substring(2),
                    name: task.name || 'Unnamed Task',
                    category: task.category || 'personal', // *** ADDED category default ***
                    reminderTimes: task.reminderTimes || [],
                    recurrence: task.recurrence || 'daily',
                    repeatInterval: task.repeatInterval || 0,
                    sound: task.sound || 'none',
                    color: task.color || '#3498db',
                    imageUrl: task.imageUrl || '',
                    nextReminderTime: task.nextReminderTime || null,
                    isCompletedForPeriod: task.isCompletedForPeriod || false
                }));

                tasks.forEach(task => {
                    calculateAndSetNextReminderTime(task);
                    renderTask(task); // Render task into appropriate category
                });

            } catch (e) { console.error("Parse error:", e); localStorage.removeItem('comicTasks'); alert("Load error."); }
        }
        console.log("Tasks loaded:", tasks);
        requestNotificationPermission(); // Request permission after loading
         // Check if permission is still denied after load, maybe show subtle warning?
        if (Notification.permission === 'denied') {
             console.warn("Note: Notifications are currently blocked in browser settings for this site.");
             // Optionally add a small, non-intrusive message to the UI
        }
    }

    function saveTasks() { try { localStorage.setItem('comicTasks', JSON.stringify(tasks)); } catch (e) { console.error("Save error:", e); } }

     // --- Task Rendering (MODIFIED for Categories) ---
     function renderTask(task) {
        const taskItem = document.createElement('div');
        taskItem.classList.add('task-item');
        // Add category class for potential specific styling
        taskItem.classList.add(task.category || 'personal');
        taskItem.dataset.id = task.id;
        taskItem.style.setProperty('--task-color', task.color);

        if (task.recurrence === 'none' && !task.nextReminderTime && task.isCompletedForPeriod) {
             taskItem.classList.add('completed');
        }

        let imageHTML = '';
        if (task.imageUrl) { imageHTML = `<img src="<span class="math-inline">\{task\.imageUrl\}" alt\="</span>{task.name}" onerror="this.style.display='none';">`; }

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
            <span class="math-inline">\{imageHTML\}
<h3\></span>{task.name}</h3>
            <p><strong>Remind At:</strong></p> ${timesListHTML}
            <p><strong>Frequency:</strong> ${task.recurrence === 'daily' ? 'Every Day' : 'Just Once'}</p>
            <p><strong>Sound:</strong> ${soundDisplayName}</p>
            ${task.repeatInterval > 0 ? `<p><strong>Repeat Delay:</strong> ${task.repeatInterval} min</p>` : ''}
            <p><strong>Next Up:</strong> ${nextDateString} ${nextTimeString} </p>
            <div class="task-actions">
                 <button class="btn complete-btn" ${(task.recurrence === 'none' && !task.nextReminderTime && task.isCompletedForPeriod) ? 'disabled' : ''}>✔️ Done Current</button>
                <button class="btn delete-btn">❌ Delete</button>
            </div>`;

        // *** Append to the correct category list ***
        const targetList = (task.category === 'work') ? workTasksDiv : personalTasksDiv;

        // If the element already exists (e.g., from a re-render), replace it
        const existingItem = targetList.querySelector(`.task-item[data-id="${task.id}"]`);
         if (existingItem) {
             targetList.replaceChild(taskItem, existingItem);
         } else {
             // Append new items smoothly
              taskItem.style.opacity = '0'; // Start hidden for animation
             targetList.appendChild(taskItem);
              // Trigger animation
              requestAnimationFrame(() => {
                  requestAnimationFrame(() => { // Double requestAnimationFrame for reliability
                     taskItem.style.opacity = '1';
                  });
              });
         }
     }


    // --- Add/Remove Time Inputs (No Change) ---
     function addTimeInput() { const ng = document.createElement('div'); ng.classList.add('time-input-group'); ng.innerHTML = `<input type="time" class="task-time-input"><button type="button" class="btn remove-time-btn time-btn">-</button>`; timeInputsContainer.appendChild(ng); }
     addTimeBtn.addEventListener('click', addTimeInput); timeInputsContainer.addEventListener('click', (e) => { if (e.target.classList.contains('remove-time-btn')) { if (timeInputsContainer.querySelectorAll('.time-input-group').length > 1) { e.target.closest('.time-input-group').remove(); } else { alert("Need at least one time!"); } } });


    // --- Add New Task (MODIFIED for Category) ---
    function addTask(event) {
        event.preventDefault();
        const reminderTimes = Array.from(timeInputsContainer.querySelectorAll('.task-time-input')).map(input => input.value).filter(Boolean);
        // *** Get selected category ***
        const selectedCategory = taskForm.querySelector('input[name="task-category"]:checked')?.value || 'personal';

        if (!taskNameInput.value || reminderTimes.length === 0) { alert("Need name and at least one time!"); return; }

        const newTask = {
            id: Date.now().toString(36) + Math.random().toString(36).substring(2),
            name: taskNameInput.value.trim(),
            category: selectedCategory, // *** Save category ***
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
        renderTask(newTask); // Render into the correct category list
        toggleAddTaskForm(false); // Hide form after adding
    }

     // --- Calculate Next Reminder Time (No Change) ---
     function calculateAndSetNextReminderTime(task) { /* ... same as before ... */ const pT = []; const now = new Date(); const nTs = now.getTime(); if (!task.reminderTimes || task.reminderTimes.length === 0) { task.nextReminderTime = null; task.isCompletedForPeriod = false; return; } task.reminderTimes.forEach(tS => { if (!tS || !tS.includes(':')) return; const [h, m] = tS.split(':').map(Number); if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return; let tD = new Date(); tD.setHours(h, m, 0, 0); if (tD.getTime() > nTs) pT.push(tD); if (task.recurrence === 'daily') { let tmD = new Date(); tmD.setDate(tmD.getDate() + 1); tmD.setHours(h, m, 0, 0); pT.push(tmD); } }); pT.sort((a, b) => a.getTime() - b.getTime()); const eND = pT.find(d => d.getTime() > nTs); task.nextReminderTime = eND ? eND.toISOString() : null; task.isCompletedForPeriod = false; }

     // --- Handle Task Actions (MODIFIED for Category Re-render) ---
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
                 taskItem.style.transition = 'opacity 0.3s ease, transform 0.3s ease, max-height 0.3s ease'; // Add max-height
                 taskItem.style.opacity = '0';
                 taskItem.style.transform = 'scale(0.8)';
                 taskItem.style.maxHeight = '0px'; // Collapse vertically
                 taskItem.style.padding = '0'; // Remove padding during collapse
                 taskItem.style.margin = '0'; // Remove margin during collapse
                 setTimeout(() => taskItem.remove(), 350); // Remove after animation
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
                    // Check task still exists before trying to revert style
                     const currentTask = tasks.find(t => t.id === taskId);
                      if (taskItem && currentTask?.nextReminderTime) {
                          taskItem.style.opacity = '1';
                          targetButton.disabled = false;
                          targetButton.textContent = '✔️ Done Current';
                      }
                 }, 3000);
            }
        }
    }

    // --- Reminder Checking & Notifications (MODIFIED to re-render correctly) ---
    function checkReminders() {
        const now = new Date();
        let changesMade = false; // Flag to batch save/re-render
        tasks.forEach((task) => {
            if (!task.nextReminderTime || task.isCompletedForPeriod) return;
            const reminderTime = new Date(task.nextReminderTime);
            if (reminderTime <= now) {
                const specificTime = reminderTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                console.log(`Reminder DUE: ${task.name} at ${specificTime}`);
                playSound(task.sound).finally(() => { // Use finally to ensure notification shows
                    showNotification(task, specificTime);
                });
                task.isCompletedForPeriod = false;
                clearTimeout(repeatTimers[task.id]);
                if (task.repeatInterval > 0) { /* ... repeat logic same as before ... */ repeatTimers[task.id] = setTimeout(() => { const cTS = tasks.find(t => t.id === task.id); if (cTS && !cTS.isCompletedForPeriod) { const oRT = new Date(task.nextReminderTime); if (oRT <= new Date()) { playSound(task.sound).finally(() => { showNotification(task, specificTime, true); }); } } delete repeatTimers[task.id]; }, task.repeatInterval * 60 * 1000); }
                calculateAndSetNextReminderTime(task);
                changesMade = true;
            }
        });
        if (changesMade) {
             saveTasks();
             // Re-render necessary tasks - more efficient would be to only update the changed task
             // For simplicity now, re-rendering all preserves categorization
             personalTasksDiv.innerHTML = '';
             workTasksDiv.innerHTML = '';
             tasks.forEach(renderTask);
        }
    }

    // --- Show Notification (No change needed) ---
    function showNotification(task, specificTime, isRepeat = false) { /* ... same as before ... */ if(Notification.permission !== "granted") return; const t=isRepeat?`⏰ Reminder: ${task.name}`:`🔔 Task Due: ${task.name}`; const o={body:`It's time for: ${task.name} (at ${specificTime})`,icon:task.imageUrl||'icon.png',tag:task.id+"_"+specificTime.replace(':',''),renotify:isRepeat,requireInteraction:isRepeat,badge:'badge.png'}; try{const n=new Notification(t,o); if(!isRepeat)setTimeout(()=>n.close(),20000); n.onclick=()=>{window.focus();const e=document.querySelector(`.task-item[data-id="${task.id}"]`);e?.scrollIntoView({behavior:'smooth',block:'center'});n.close();}}catch(e){console.error("Notify error:",e);} }

     // --- Start Reminder Checks (No change needed) ---
     function startReminderChecks() { /* ... same as before ...