(function () {
  let inModal = false
  let tasks = []
  let currentTaskIndex = 0
  let loggingActive = false
  let taskStartTime = null
  let currentLog = []
  let allLogs = []
  let timeCheckInterval = null
  let timedOut = false

  const loadState = () => {
    try {
      const stored = localStorage.getItem('logger_state')
      if (stored) {
        const state = JSON.parse(stored)
        tasks = state.tasks || []
        currentTaskIndex = state.currentTaskIndex || 0
        allLogs = state.allLogs || []
        loggingActive = state.loggingActive || false
        taskStartTime = state.taskStartTime
          ? new Date(state.taskStartTime)
          : null
        currentLog = state.currentLog || []
        timedOut = state.timedOut || false
      }
    } catch (e) {
      console.error('Error loading state:', e)
    }
  }

  const persistState = () => {
    try {
      localStorage.setItem(
        'logger_state',
        JSON.stringify({
          tasks,
          currentTaskIndex,
          allLogs,
          loggingActive,
          taskStartTime: taskStartTime ? taskStartTime.toISOString() : null,
          currentLog,
          timedOut
        })
      )
    } catch (e) {
      console.error('Error persisting state:', e)
    }
  }

  const createLoggerUI = () => {
    if (document.getElementById('logger-panel')) return

    const panel = document.createElement('div')
    panel.id = 'logger-panel'
    panel.style.position = 'fixed'
    panel.style.top = '1px'
    panel.style.right = '535px'
    panel.style.backgroundColor = '#222'
    panel.style.color = '#fff'
    panel.style.border = '1px solid #555'
    panel.style.padding = '6px'
    panel.style.borderRadius = '8px'
    panel.style.zIndex = '9999'
    panel.style.fontFamily = 'Arial, sans-serif'
    panel.style.fontSize = '13px'
    panel.style.boxShadow = '0 2px 6px rgba(0,0,0,0.5)'

    panel.innerHTML = `
      <div id="logger-content">
        <div id="load-section" style="text-align: center;">
          <button id="load-tasks" style="padding: 6px 12px; border-radius: 4px; border: none; background: #007bff; color: white; cursor: pointer; font-size: 12px; font-weight: bold;">Load Tasks</button>
          <input type="file" id="task-file-input" accept=".json" style="display: none;">
        </div>
        <div id="task-section" style="display: none;">
          <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 4px;">
            <div><strong>Task:</strong> <span id="logger-task">-</span></div>
          </div>
          <div style="margin-bottom: 6px;"><strong>Status:</strong> <span id="logger-status" style="color: #f00">Not Active</span></div>
          <div style="display: flex; gap: 4px; margin-bottom: 4px;">
            <button id="start-task" style="flex: 1; padding: 4px 6px; border-radius: 4px; border: none; cursor: pointer; font-size: 11px; font-weight: bold; background-color: rgba(3, 159, 3, 1); color: #fff; max-width: 70px;">Start</button>
            <button id="skip-task" style="flex: 1; padding: 4px 6px; border-radius: 4px; border: none; cursor: pointer; font-size: 11px; font-weight: bold; background-color: #ffc107; color: #000; max-width: 70px;">Skip</button>
            <button id="finish-task" style="flex: 1; padding: 4px 6px; border-radius: 4px; border: none; cursor: pointer; font-size: 11px; font-weight: bold; background-color: #dc3545; color: #fff; max-width: 70px; display: none;">Finish</button>
          </div>
          <button id="export-logger" style="width: calc(2 * 70px + 4px); padding: 6px; border-radius: 4px; border: none; cursor: pointer; background: #333; color: #fff; font-size: 12px; font-weight: bold; display: block; margin: 0 auto;">Export</button>
        </div>
      </div>
    `

    document.body.appendChild(panel)

    document.getElementById('load-tasks').onclick = () => {
      document.getElementById('task-file-input').click()
    }

    document.getElementById('task-file-input').onchange = handleFileSelect
    document.getElementById('start-task').onclick = startTask
    document.getElementById('skip-task').onclick = skipTask
    document.getElementById('finish-task').onclick = finishTask
    document.getElementById('export-logger').onclick = exportData
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        tasks = JSON.parse(event.target.result)
        if (!Array.isArray(tasks) || tasks.length === 0) {
          alert('Invalid task file format. Expected an array of tasks.')
          return
        }

        for (let task of tasks) {
          if (!task.description || !task.maxTime) {
            alert('Invalid task format. Each task must have: description and maxTime.')
            return
          }
          if (task.type === 'find' && !task.question) {
            alert(`Task "${task.description}" has type 'find' but is missing the 'question' field.`)
            return
          }
        }

        currentTaskIndex = 0
        allLogs = []
        loggingActive = false
        timedOut = false
        document.getElementById('load-section').style.display = 'none'
        document.getElementById('task-section').style.display = 'block'
        updatePanel()
        persistState()
      } catch (err) {
        alert('Error parsing JSON file: ' + err.message)
      }
    }
    reader.readAsText(file)
  }

  const updatePanel = () => {
    if (tasks.length === 0) return

    document.getElementById('logger-task').textContent = currentTaskIndex + 1

    const statusEl = document.getElementById('logger-status')
    if (!loggingActive) {
      statusEl.textContent = 'Not Active'
      statusEl.style.color = '#f00'
    } else {
      statusEl.textContent = 'Active'
      statusEl.style.color = timedOut ? '#f90' : '#0f0'
    }

    const startBtn = document.getElementById('start-task')
    const skipBtn = document.getElementById('skip-task')
    const finishBtn = document.getElementById('finish-task')

    if (loggingActive) {
      startBtn.style.display = 'none'
      skipBtn.style.display = 'none'
      finishBtn.style.display = 'block'
      finishBtn.disabled = false
      finishBtn.style.cursor = 'pointer'
      finishBtn.style.backgroundColor = '#dc3545'
    } else {
      startBtn.style.display = 'block'
      skipBtn.style.display = 'block'
      finishBtn.style.display = 'none'
      startBtn.disabled = false
      startBtn.style.cursor = 'pointer'
      startBtn.style.backgroundColor = 'rgba(3, 161, 3, 1)'
      skipBtn.disabled = false
      skipBtn.style.cursor = 'pointer'
      skipBtn.style.backgroundColor = '#daa400ff'
    }
  }

  const startTask = () => {
    if (loggingActive) return

    loggingActive = true
    timedOut = false
    taskStartTime = new Date()
    currentLog = []
    updatePanel()
    persistState()

    timeCheckInterval = setInterval(() => {
      if (!loggingActive) {
        clearInterval(timeCheckInterval)
        timeCheckInterval = null
        return
      }
      if (timedOut) {
        clearInterval(timeCheckInterval)
        timeCheckInterval = null
        return
      }

      const elapsed = (new Date() - taskStartTime) / 1000
      const currentTask = tasks[currentTaskIndex]

      if (elapsed >= currentTask.maxTime) {
        // Soft timeout: just mark it, task keeps running
        timedOut = true
        persistState()
        updatePanel()
        clearInterval(timeCheckInterval)
        timeCheckInterval = null
      }
    }, 1000)
  }

  const completeTask = (reason) => {
    if (!loggingActive || !taskStartTime) return

    loggingActive = false
    if (timeCheckInterval) {
      clearInterval(timeCheckInterval)
      timeCheckInterval = null
    }

    const now = new Date()
    const taskDuration = (now - taskStartTime) / 1000
    const currentTask = tasks[currentTaskIndex]
    const wasTimedOut = timedOut

    const buildAndSave = (answer, difficulty) => {
      const taskType = currentTask.type || 'do'

      let completedGoal
      if (taskType === 'find') {
        completedGoal = typeof answer === 'string' && answer.trim().length > 0
      } else if (currentTask.endElement) {
        completedGoal = reason === 'completed'
      } else {
        completedGoal = reason === 'manual_finish'
      }

      const taskData = {
        task: `task${currentTaskIndex + 1}`,
        type: taskType,
        description: currentTask.description,
        duration: taskDuration,
        maxTime: currentTask.maxTime,
        completionReason: reason,
        completedInTime: !wasTimedOut,
        completedGoal: completedGoal,
        difficulty: difficulty,
        clicks: currentLog.filter((e) => e.type === 'click').length,
        events: currentLog
      }
      if (taskType === 'find') {
        taskData.question = currentTask.question
        taskData.answer = answer
      }
      allLogs.push(taskData)
      timedOut = false
      moveToNextTask()
    }

    const showModals = () => {
      if (currentTask.type === 'find') {
        showAnswerModal(currentTask.question, (answer) => {
          showDifficultyModal((difficulty) => {
            buildAndSave(answer, difficulty)
          })
        })
      } else {
        showDifficultyModal((difficulty) => {
          buildAndSave(null, difficulty)
        })
      }
    }

    if (reason === 'completed') {
      setTimeout(showModals, 1500)
    } else {
      showModals()
    }
  }

  const moveToNextTask = () => {
    currentTaskIndex++
    taskStartTime = null
    currentLog = []

    persistState()

    if (currentTaskIndex >= tasks.length) {
      showCompletionMessage()
    } else {
      updatePanel()
    }
  }

  const showSkipConfirmModal = (onConfirm) => {
    inModal = true
    const modal = document.createElement('div')
    modal.style.position = 'fixed'
    modal.style.top = '0'
    modal.style.left = '0'
    modal.style.width = '100vw'
    modal.style.height = '100vh'
    modal.style.backgroundColor = 'rgba(0,0,0,0.5)'
    modal.style.display = 'flex'
    modal.style.justifyContent = 'center'
    modal.style.alignItems = 'center'
    modal.style.zIndex = '99999'

    const box = document.createElement('div')
    box.style.background = '#333'
    box.style.color = '#fff'
    box.style.padding = '24px 30px'
    box.style.borderRadius = '10px'
    box.style.textAlign = 'center'
    box.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)'
    box.style.fontFamily = 'Arial, sans-serif'
    box.style.fontSize = '14px'
    box.style.minWidth = '300px'

    box.innerHTML = `
      <h3 style="margin-bottom: 12px; color: #ddd;">Skip task?</h3>
      <p style="margin-bottom: 20px; color: #aaa;">Are you sure you want to skip this task?</p>
      <div style="display: flex; justify-content: center; gap: 10px;">
        <button id="skip-cancel" style="padding: 8px 20px; border-radius: 6px; border: 1px solid #666; background: #555; color: #fff; cursor: pointer; font-size: 13px; font-weight: bold;">No</button>
        <button id="skip-confirm" style="padding: 8px 20px; border-radius: 6px; border: none; background: #ffc107; color: #000; cursor: pointer; font-size: 13px; font-weight: bold;">Yes, skip</button>
      </div>
    `

    modal.appendChild(box)
    document.body.appendChild(modal)

    document.getElementById('skip-cancel').onclick = () => {
      document.body.removeChild(modal)
      inModal = false
    }

    document.getElementById('skip-confirm').onclick = () => {
      document.body.removeChild(modal)
      inModal = false
      onConfirm()
    }
  }

  const skipTask = () => {
    if (loggingActive) return

    showSkipConfirmModal(() => {
      const currentTask = tasks[currentTaskIndex]
      const taskData = {
      task: `task${currentTaskIndex + 1}`,
      type: currentTask.type || 'do',
      description: currentTask.description,
      duration: 0,
      maxTime: currentTask.maxTime,
      completionReason: 'skipped',
      completedInTime: false,
      difficulty: null,
      clicks: 0,
      events: [],
      skipped: true
    }
    if (currentTask.type === 'find') {
      taskData.question = currentTask.question
      taskData.answer = null
    }
    allLogs.push(taskData)

    currentTaskIndex++
    timedOut = false
    persistState()

      if (currentTaskIndex >= tasks.length) {
        showCompletionMessage()
      } else {
        updatePanel()
      }
    })
  }

  const finishTask = () => {
    if (!loggingActive) return
    completeTask('manual_finish')
  }

  const showCompletionMessage = () => {
    document.getElementById('task-section').innerHTML = `
      <div style="text-align: center; padding: 15px;">
        <h4 style="color: #28a745; margin-bottom: 8px; font-size: 14px;">Complete!</h4>
        <p style="margin-bottom: 10px; font-size: 12px;">All ${tasks.length} tasks done.</p>
        <button id="export-final" style="padding: 6px 12px; border-radius: 4px; border: none; background: #007bff; color: white; cursor: pointer; font-size: 12px; font-weight: bold;">Export</button>
      </div>
    `
    document.getElementById('export-final').onclick = exportData
  }

  const showAnswerModal = (question, onSubmit) => {
    inModal = true
    const modal = document.createElement('div')
    modal.style.position = 'fixed'
    modal.style.top = '0'
    modal.style.left = '0'
    modal.style.width = '100vw'
    modal.style.height = '100vh'
    modal.style.backgroundColor = 'rgba(0,0,0,0.5)'
    modal.style.display = 'flex'
    modal.style.justifyContent = 'center'
    modal.style.alignItems = 'center'
    modal.style.zIndex = '99999'

    const box = document.createElement('div')
    box.style.background = '#333'
    box.style.color = '#fff'
    box.style.padding = '24px 30px'
    box.style.borderRadius = '10px'
    box.style.textAlign = 'center'
    box.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)'
    box.style.fontFamily = 'Arial, sans-serif'
    box.style.fontSize = '14px'
    box.style.minWidth = '380px'
    box.style.maxWidth = '480px'

    box.innerHTML = `
      <h3 style="margin-bottom: 14px; font-size: 15px; color: #ddd;">Answer the question</h3>
      <p style="margin-bottom: 14px; color: #ddd; line-height: 1.4; text-align: left;">${question}</p>
      <textarea id="answer-input" rows="3" placeholder="Enter your answer here..." style="width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 6px; border: 1px solid #666; background: #444; color: #fff; font-size: 13px; resize: vertical; font-family: Arial, sans-serif;"></textarea>
      <button id="answer-submit" style="margin-top: 12px; padding: 10px 24px; border-radius: 6px; border: none; background: #007bff; color: #fff; cursor: pointer; font-size: 13px; font-weight: bold;">Confirm</button>
    `

    modal.appendChild(box)
    document.body.appendChild(modal)

    setTimeout(() => {
      const ta = document.getElementById('answer-input')
      if (ta) ta.focus()
    }, 50)

    document.getElementById('answer-submit').onclick = () => {
      const answer = document.getElementById('answer-input').value.trim()
      document.body.removeChild(modal)
      inModal = false
      onSubmit(answer)
    }
  }

  const showDifficultyModal = (onSubmit) => {
    inModal = true
    const modal = document.createElement('div')
    modal.style.position = 'fixed'
    modal.style.top = '0'
    modal.style.left = '0'
    modal.style.width = '100vw'
    modal.style.height = '100vh'
    modal.style.backgroundColor = 'rgba(0,0,0,0.5)'
    modal.style.display = 'flex'
    modal.style.justifyContent = 'center'
    modal.style.alignItems = 'center'
    modal.style.zIndex = '99999'

    const box = document.createElement('div')
    box.style.background = '#333'
    box.style.color = '#fff'
    box.style.padding = '20px 30px'
    box.style.borderRadius = '10px'
    box.style.textAlign = 'center'
    box.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)'
    box.style.fontFamily = 'Arial, sans-serif'
    box.style.fontSize = '14px'
    box.style.minWidth = '350px'

    box.innerHTML = `
      <h3 style="margin-bottom: 12px; color: #ddd;">Rate the difficulty of the task</h3>
      <p style="margin-bottom: 12px; white-space: nowrap;">Choose a number from 1 (Very Difficult) to 7 (Very Easy)</p>
      <div id="difficulty-buttons" style="display: flex; justify-content: center; gap: 6px;">
        ${[1, 2, 3, 4, 5, 6, 7]
          .map(
            (n) =>
              `<button style="padding: 12px 16px; border-radius: 6px; border: 1px solid #777; background: #555; color: #fff; cursor: pointer; font-weight: bold;" data-val="${n}">${n}</button>`
          )
          .join('')}
      </div>
    `

    modal.appendChild(box)
    document.body.appendChild(modal)

    box.querySelectorAll('button').forEach((btn) => {
      btn.onclick = () => {
        const val = parseInt(btn.getAttribute('data-val'))
        document.body.removeChild(modal)
        inModal = false
        onSubmit(val)
      }
    })
  }

  const exportData = () => {
    const blob = new Blob([JSON.stringify(allLogs, null, 2)], {
      type: 'application/json'
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `task_log_${new Date().toISOString()}.json`
    a.click()
    URL.revokeObjectURL(a.href)

    localStorage.removeItem('logger_state')
    tasks = []
    allLogs = []
    currentTaskIndex = 0
    currentLog = []
    taskStartTime = null
    loggingActive = false
    timedOut = false

    if (timeCheckInterval) {
      clearInterval(timeCheckInterval)
      timeCheckInterval = null
    }

    const panel = document.getElementById('logger-panel')
    if (panel) {
      document.body.removeChild(panel)
      createLoggerUI()
    }
  }

  const matchesSelector = (element, selector) => {
    try {
      if (element.matches && element.matches(selector)) return true
      if (element.closest && element.closest(selector)) return true
      if (selector.startsWith('#')) return element.id === selector.substring(1)
      if (selector.startsWith('.')) return element.classList && element.classList.contains(selector.substring(1))
      return element.tagName && element.tagName.toLowerCase() === selector.toLowerCase()
    } catch (e) {
      return false
    }
  }

  document.addEventListener('click', (e) => {
    if (!loggingActive || inModal || tasks.length === 0) return

    const info = {
      type: 'click',
      time: new Date().toISOString(),
      x: e.pageX,
      y: e.pageY,
      element: e.target.tagName,
      id: e.target.id || 'no-id',
      class: e.target.className || 'no-class',
      url: window.location.href
    }
    currentLog.push(info)
    persistState()

    // endElement only applies to non-find tasks
    const currentTask = tasks[currentTaskIndex]
    if (
      currentTask.type !== 'find' &&
      currentTask.endElement &&
      matchesSelector(e.target, currentTask.endElement)
    ) {
      completeTask('completed')
    }
  })

  document.addEventListener('keydown', (e) => {
    if (!loggingActive || inModal) return
    const info = {
      type: 'keydown',
      time: new Date().toISOString(),
      key: e.key,
      element: e.target.tagName,
      id: e.target.id || 'no-id'
    }
    currentLog.push(info)
    persistState()
  })

  // --- Scroll tracking (throttled) ---
  let lastScrollTime = 0
  let scrollPersistTimeout = null
  document.addEventListener('scroll', () => {
    if (!loggingActive || inModal) return

    const now = Date.now()
    if (now - lastScrollTime < 300) return
    lastScrollTime = now

    const info = {
      type: 'scroll',
      time: new Date().toISOString(),
      scrollX: Math.round(window.scrollX),
      scrollY: Math.round(window.scrollY),
      url: window.location.href
    }
    currentLog.push(info)

    // Debounce persist
    clearTimeout(scrollPersistTimeout)
    scrollPersistTimeout = setTimeout(() => persistState(), 300)
  }, { passive: true })

  // --- Mouse position tracking (throttled) ---
  let mouseStopTimeout = null
  let lastMousePos = null
  document.addEventListener('mousemove', (e) => {
    if (!loggingActive || inModal) return

    const x = e.pageX
    const y = e.pageY

    clearTimeout(mouseStopTimeout)
    mouseStopTimeout = setTimeout(() => {
      if (lastMousePos && lastMousePos.x === x && lastMousePos.y === y) return

      lastMousePos = { x, y }
      const info = {
        type: 'mouse_stop',
        time: new Date().toISOString(),
        x,
        y,
        url: window.location.href
      }
      currentLog.push(info)
    }, 300)
  })

  loadState()

  const initializeUI = () => {
    createLoggerUI()

    if (tasks.length > 0) {
      const loadSection = document.getElementById('load-section')
      const taskSection = document.getElementById('task-section')
      if (loadSection && taskSection) {
        loadSection.style.display = 'none'
        taskSection.style.display = 'block'
        updatePanel()

        // Resume timeout check if still active and not yet timed out
        if (loggingActive && !timedOut) {
          timeCheckInterval = setInterval(() => {
            if (!loggingActive || timedOut) {
              clearInterval(timeCheckInterval)
              timeCheckInterval = null
              return
            }
            const elapsed = (new Date() - taskStartTime) / 1000
            const currentTask = tasks[currentTaskIndex]
            if (elapsed >= currentTask.maxTime) {
              timedOut = true
              persistState()
              updatePanel()
              clearInterval(timeCheckInterval)
              timeCheckInterval = null
            }
          }, 1000)
        }
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUI)
  } else {
    initializeUI()
  }

  window.addEventListener('load', () => {
    if (!document.getElementById('logger-panel')) {
      initializeUI()
    }
  })
})()
