// Bug Report Modal JavaScript
// Handles modal functionality and Telegram bot integration

(function() {
  'use strict';

  // ========================================
  // CONFIGURATION
  // ========================================
  // IMPORTANT: Replace these with your actual Telegram bot credentials
  // Get bot token from @BotFather on Telegram
  // Get chat ID by messaging your bot and visiting: https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
  
  const TELEGRAM_CONFIG = {
    botToken: 'YOUR_BOT_TOKEN_HERE',     // Replace with your bot token from @BotFather
    chatId: 'YOUR_CHAT_ID_HERE'          // Replace with your chat ID
  };

  // Maximum file size (5MB in bytes)
  const MAX_FILE_SIZE = 5 * 1024 * 1024;

  // ========================================
  // DOM ELEMENTS
  // ========================================
  const modal = document.getElementById('bugModal');
  const reportBugLink = document.getElementById('reportBugLink');
  const closeModalBtn = document.getElementById('closeModal');
  const bugForm = document.getElementById('bugReportForm');
  const bugDescription = document.getElementById('bugDescription');
  const charCount = document.getElementById('charCount');
  const submitButton = document.getElementById('submitButton');
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('screenshot');
  const imagePreview = document.getElementById('imagePreview');
  const previewImg = document.getElementById('previewImg');
  const messageContainer = document.getElementById('messageContainer');

  let selectedFile = null;

  // ========================================
  // MODAL CONTROL
  // ========================================
  
  // Open modal
  function openModal() {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  // Close modal
  function closeModal() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
    bugForm.reset();
    selectedFile = null;
    imagePreview.style.display = 'none';
    messageContainer.innerHTML = '';
    updateCharCount();
    updateSubmitButton();
  }

  // Event listeners for opening/closing modal
  reportBugLink.addEventListener('click', function(e) {
    e.preventDefault();
    openModal();
  });

  closeModalBtn.addEventListener('click', closeModal);

  // Close modal when clicking outside
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Close modal on ESC key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeModal();
    }
  });

  // ========================================
  // FORM VALIDATION
  // ========================================
  
  // Update character count
  function updateCharCount() {
    const count = bugDescription.value.length;
    charCount.textContent = count;
    updateSubmitButton();
  }

  // Update submit button state
  function updateSubmitButton() {
    const descLength = bugDescription.value.trim().length;
    submitButton.disabled = descLength < 10;
  }

  bugDescription.addEventListener('input', updateCharCount);

  // ========================================
  // FILE UPLOAD HANDLING
  // ========================================
  
  // Click to upload
  uploadArea.addEventListener('click', function() {
    fileInput.click();
  });

  // Drag and drop
  uploadArea.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.style.borderColor = 'var(--gold)';
  });

  uploadArea.addEventListener('dragleave', function(e) {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.style.borderColor = '';
  });

  uploadArea.addEventListener('drop', function(e) {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.style.borderColor = '';
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  });

  fileInput.addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  });

  // Handle file selection
  function handleFileSelect(file) {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      showMessage('Please select an image file.', 'error');
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      showMessage('File size must be less than 5MB.', 'error');
      return;
    }

    selectedFile = file;

    // Show preview
    const reader = new FileReader();
    reader.onload = function(e) {
      previewImg.src = e.target.result;
      imagePreview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  }

  // ========================================
  // FORM SUBMISSION
  // ========================================
  
  bugForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    const description = bugDescription.value.trim();

    if (description.length < 10) {
      showMessage('Please provide at least 10 characters in the description.', 'error');
      return;
    }

    // Show loading state
    submitButton.classList.add('loading');
    submitButton.disabled = true;

    try {
      await sendToTelegram(description, selectedFile);
      showMessage('🐦‍⬛ A raven has been sent!', 'success');
      
      // Auto-close modal after 2 seconds
      setTimeout(() => {
        closeModal();
      }, 2000);
    } catch (error) {
      console.error('Error sending bug report:', error);
      showMessage('Failed to send report. Please try again.', 'error');
    } finally {
      submitButton.classList.remove('loading');
      submitButton.disabled = false;
    }
  });

  // ========================================
  // TELEGRAM API INTEGRATION
  // ========================================
  
  async function sendToTelegram(description, file) {
    // Get user agent info
    const userAgent = navigator.userAgent;
    const timestamp = new Date().toLocaleString();

    // Build message text
    const messageText = `🐛 BUG REPORT

Description:
${description}

Timestamp: ${timestamp}
User Agent: ${userAgent}`;

    // Check if config is set up
    if (TELEGRAM_CONFIG.botToken === 'YOUR_BOT_TOKEN_HERE' || 
        TELEGRAM_CONFIG.chatId === 'YOUR_CHAT_ID_HERE') {
      console.warn('Telegram bot not configured. Update TELEGRAM_CONFIG in bug-report-modal.js');
      // For demo purposes, just show success
      return Promise.resolve();
    }

    const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_CONFIG.botToken}`;

    // Send message with or without photo
    if (file) {
      // Send photo with caption
      const formData = new FormData();
      formData.append('chat_id', TELEGRAM_CONFIG.chatId);
      formData.append('photo', file);
      formData.append('caption', messageText);

      const response = await fetch(`${telegramApiUrl}/sendPhoto`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to send to Telegram');
      }

      return await response.json();
    } else {
      // Send text only
      const response = await fetch(`${telegramApiUrl}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: TELEGRAM_CONFIG.chatId,
          text: messageText
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send to Telegram');
      }

      return await response.json();
    }
  }

  // ========================================
  // MESSAGE DISPLAY
  // ========================================
  
  function showMessage(text, type) {
    messageContainer.innerHTML = `
      <div class="bug-${type}-msg">
        ${text}
      </div>
    `;

    // Auto-clear error messages after 5 seconds
    if (type === 'error') {
      setTimeout(() => {
        messageContainer.innerHTML = '';
      }, 5000);
    }
  }

  // ========================================
  // INITIALIZATION
  // ========================================
  
  // Initialize on page load
  updateCharCount();
  updateSubmitButton();

})();
