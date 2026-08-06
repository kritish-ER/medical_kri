document.addEventListener('DOMContentLoaded', () => {
    // State management
    const state = {
        currentTab: 'tab-chat',
        voiceEnabled: false,
        allSymptoms: [],
        selectedSymptoms: new Set(),
        diseases: [],
        analyticsData: null,
        charts: {}
    };

    // DOM Elements
    const elements = {
        statusText: document.getElementById('statusText'),
        headerTitle: document.getElementById('headerTitle'),
        headerSubtitle: document.getElementById('headerSubtitle'),
        voiceToggle: document.getElementById('voiceToggle'),
        clearChatBtn: document.getElementById('clearChatBtn'),
        chatMessages: document.getElementById('chatMessages'),
        chatInput: document.getElementById('chatInput'),
        sendBtn: document.getElementById('sendBtn'),
        micBtn: document.getElementById('micBtn'),
        symptomSearchInput: document.getElementById('symptomSearchInput'),
        symptomGrid: document.getElementById('symptomGrid'),
        selectedBadgeBox: document.getElementById('selectedBadgeBox'),
        runPredictionBtn: document.getElementById('runPredictionBtn'),
        checkerResults: document.getElementById('checkerResults'),
        dbSearchInput: document.getElementById('dbSearchInput'),
        diseaseGrid: document.getElementById('diseaseGrid'),
        modal: document.getElementById('diseaseModal'),
        modalBody: document.getElementById('modalBody'),
        modalClose: document.getElementById('modalClose')
    };

    // Initialize Application
    init();

    async function init() {
        setupNavigation();
        setupChat();
        setupSpeech();
        setupSymptomChecker();
        setupDatabase();
        setupModal();
        await checkStatus();
        await loadSymptoms();
        await loadDiseases();
        await loadAnalytics();
    }

    // ==========================================
    // SYSTEM STATUS
    // ==========================================
    async function checkStatus() {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            if (data.status === 'online') {
                elements.statusText.textContent = `Online (${data.diseases_count} Diseases)`;
            }
        } catch (e) {
            elements.statusText.textContent = 'Server Offline';
        }
    }

    // ==========================================
    // NAVIGATION & TAB SWITCHING
    // ==========================================
    function setupNavigation() {
        const navBtns = document.querySelectorAll('.nav-btn');
        const tabPanes = document.querySelectorAll('.tab-pane');

        const headers = {
            'tab-chat': {
                title: 'AI Medical Assistant',
                subtitle: 'Ask medical questions, predict conditions from symptoms, and explore 48+ diseases'
            },
            'tab-checker': {
                title: 'Interactive Symptom Checker',
                subtitle: 'Select symptoms to calculate statistical match score & medical evidence'
            },
            'tab-database': {
                title: 'Medical Conditions Library',
                subtitle: 'Browse 48+ diseases, medications, side effects, and body parts affected'
            },
            'tab-analytics': {
                title: 'Dataset Insights & Analytics',
                subtitle: 'Statistical visualizations of case study frequencies and treatment ratings'
            }
        };

        navBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.dataset.tab;
                
                navBtns.forEach(b => b.classList.remove('active'));
                tabPanes.forEach(p => p.classList.remove('active'));

                btn.classList.add('active');
                document.getElementById(targetTab).classList.add('active');

                state.currentTab = targetTab;
                if (headers[targetTab]) {
                    elements.headerTitle.textContent = headers[targetTab].title;
                    elements.headerSubtitle.textContent = headers[targetTab].subtitle;
                }

                if (targetTab === 'tab-analytics' && state.analyticsData) {
                    renderAnalyticsCharts();
                }
            });
        });
    }

    // ==========================================
    // CHATBOT ENGINE
    // ==========================================
    function setupChat() {
        // Initial Bot Welcome Message
        appendMessage('bot', `👋 **Welcome to MediMind AI Medical Assistant!**\n\nI am trained on **48+ medical conditions**, patient symptoms, medications, and side effects.\n\n• Type your symptoms (e.g., *"I have fever, cough, and shortness of breath"*)\n• Ask about diseases (e.g., *"Tell me about Asthma"*)\n• Or ask about drugs (e.g., *"What drugs treat ADHD?"*)\n\n*How may I help you today?*`);

        elements.sendBtn.addEventListener('click', sendMessage);
        elements.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });

        elements.clearChatBtn.addEventListener('click', () => {
            elements.chatMessages.innerHTML = '';
            appendMessage('bot', `Chat session reset. How can I assist you now?`);
        });

        // Quick symptom chips
        document.querySelectorAll('.chip-btn').forEach(chip => {
            chip.addEventListener('click', () => {
                const text = chip.dataset.text;
                elements.chatInput.value = text;
                sendMessage();
            });
        });
    }

    async function sendMessage() {
        const text = elements.chatInput.value.trim();
        if (!text) return;

        appendMessage('user', text);
        elements.chatInput.value = '';

        // Show typing indicator
        const typingId = showTypingIndicator();

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text })
            });
            const data = await res.json();
            
            removeTypingIndicator(typingId);
            appendMessage('bot', data.response);

            if (state.voiceEnabled) {
                speakText(data.response);
            }
        } catch (e) {
            removeTypingIndicator(typingId);
            appendMessage('bot', "⚠️ Sorry, I ran into a network error. Please ensure the server is running.");
        }
    }

    function appendMessage(sender, text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg ${sender}`;

        const avatar = document.createElement('div');
        avatar.className = 'chat-avatar';
        avatar.innerHTML = sender === 'bot' ? '<i class="fa-solid fa-user-doctor"></i>' : '<i class="fa-solid fa-user"></i>';

        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble';
        bubble.innerHTML = formatMarkdown(text);

        msgDiv.appendChild(avatar);
        msgDiv.appendChild(bubble);

        elements.chatMessages.appendChild(msgDiv);
        elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    }

    function showTypingIndicator() {
        const id = 'typing-' + Date.now();
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-msg bot';
        msgDiv.id = id;
        msgDiv.innerHTML = `
            <div class="chat-avatar"><i class="fa-solid fa-user-doctor"></i></div>
            <div class="chat-bubble"><i class="fa-solid fa-circle-notch fa-spin"></i> Analyzing medical data...</div>
        `;
        elements.chatMessages.appendChild(msgDiv);
        elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
        return id;
    }

    function removeTypingIndicator(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    function formatMarkdown(text) {
        let html = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n• (.*?)/g, '<li>$1</li>');

        if (html.includes('<li>')) {
            html = html.replace(/(<li>.*?<\/li>)/s, '<ul>$1</ul>');
        }
        return `<p>${html}</p>`;
    }

    // ==========================================
    // VOICE SPEECH SYNTHESIS & RECOGNITION
    // ==========================================
    function setupSpeech() {
        // Voice Output Toggle
        elements.voiceToggle.addEventListener('click', () => {
            state.voiceEnabled = !state.voiceEnabled;
            elements.voiceToggle.classList.toggle('active', state.voiceEnabled);
        });

        // Speech Recognition (Mic Input)
        if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;

            recognition.onstart = () => {
                elements.micBtn.classList.add('recording');
            };

            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                elements.chatInput.value = transcript;
                sendMessage();
            };

            recognition.onend = () => {
                elements.micBtn.classList.remove('recording');
            };

            elements.micBtn.addEventListener('click', () => {
                try {
                    recognition.start();
                } catch (e) {
                    recognition.stop();
                }
            });
        } else {
            elements.micBtn.style.display = 'none';
        }
    }

    function speakText(text) {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            // Remove markdown symbols for voice
            const cleanText = text.replace(/[*#_`]/g, '').replace(/<[^>]*>/g, '');
            const utterance = new SpeechSynthesisUtterance(cleanText);
            utterance.rate = 1.0;
            window.speechSynthesis.speak(utterance);
        }
    }

    // ==========================================
    // SYMPTOM CHECKER TAB
    // ==========================================
    async function loadSymptoms() {
        try {
            const res = await fetch('/api/symptoms');
            state.allSymptoms = await res.json();
            renderSymptomGrid(state.allSymptoms);
        } catch (e) {
            console.error('Error loading symptoms', e);
        }
    }

    function setupSymptomChecker() {
        elements.symptomSearchInput.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().strip ? e.target.value.toLowerCase().strip() : e.target.value.toLowerCase();
            const filtered = state.allSymptoms.filter(s => s.name.toLowerCase().includes(q));
            renderSymptomGrid(filtered);
        });

        elements.runPredictionBtn.addEventListener('click', runSymptomPrediction);
    }

    function renderSymptomGrid(symptoms) {
        elements.symptomGrid.innerHTML = '';
        symptoms.forEach(sym => {
            const btn = document.createElement('button');
            btn.className = `sym-btn ${state.selectedSymptoms.has(sym.id) ? 'selected' : ''}`;
            btn.textContent = sym.name;
            btn.addEventListener('click', () => toggleSymptom(sym));
            elements.symptomGrid.appendChild(btn);
        });
    }

    function toggleSymptom(sym) {
        if (state.selectedSymptoms.has(sym.id)) {
            state.selectedSymptoms.delete(sym.id);
        } else {
            state.selectedSymptoms.add(sym.id);
        }
        updateSelectedBadges();
        renderSymptomGrid(state.allSymptoms);
    }

    function updateSelectedBadges() {
        elements.selectedBadgeBox.innerHTML = '';
        state.selectedSymptoms.forEach(symId => {
            const symObj = state.allSymptoms.find(s => s.id === symId);
            if (!symObj) return;

            const badge = document.createElement('span');
            badge.className = 'symptom-badge';
            badge.innerHTML = `${symObj.name} <i class="fa-solid fa-xmark" data-id="${symObj.id}"></i>`;
            badge.querySelector('i').addEventListener('click', () => toggleSymptom(symObj));
            elements.selectedBadgeBox.appendChild(badge);
        });
    }

    async function runSymptomPrediction() {
        const symptomsList = Array.from(state.selectedSymptoms);
        if (symptomsList.length === 0) {
            alert('Please select at least 1 symptom from the list!');
            return;
        }

        elements.checkerResults.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><h3>Calculating Match Scores...</h3></div>';

        try {
            const res = await fetch('/api/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symptoms: symptomsList })
            });
            const data = await res.json();
            renderCheckerResults(data.predictions);
        } catch (e) {
            elements.checkerResults.innerHTML = '<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><h3>Prediction Failed</h3></div>';
        }
    }

    function renderCheckerResults(predictions) {
        if (!predictions || predictions.length === 0) {
            elements.checkerResults.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-file-circle-question"></i>
                    <h3>No Strong Match Found</h3>
                    <p>Try selecting additional symptoms to narrow down potential medical conditions.</p>
                </div>
            `;
            return;
        }

        let html = `<h3>Top Disease Alignments (${predictions.length})</h3><p class="subtitle mb-3">Ranked by symptom overlap and patient case evidence</p>`;

        predictions.forEach(p => {
            const drugsStr = p.drugs.map(d => d.name).join(', ') || 'Consult doctor';
            const bodyStr = p.body_parts.join(', ') || 'General';
            const effectsStr = p.side_effects.join(', ') || 'None';

            html += `
                <div class="prediction-card">
                    <div class="pred-header">
                        <h4>${p.disease}</h4>
                        <span class="confidence-pill">${p.confidence}% Match</span>
                    </div>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <strong>Matched Symptoms:</strong>
                            ${p.matched_symptoms.join(', ')}
                        </div>
                        <div class="detail-item">
                            <strong>Recommended Drugs:</strong>
                            ${drugsStr}
                        </div>
                        <div class="detail-item">
                            <strong>Affected Body Parts:</strong>
                            ${bodyStr}
                        </div>
                        <div class="detail-item">
                            <strong>Side Effects to Watch:</strong>
                            ${effectsStr}
                        </div>
                    </div>
                </div>
            `;
        });

        elements.checkerResults.innerHTML = html;
    }

    // ==========================================
    // MEDICAL LIBRARY & DATABASE
    // ==========================================
    async function loadDiseases() {
        try {
            const res = await fetch('/api/diseases');
            state.diseases = await res.json();
            renderDiseaseGrid(state.diseases);
        } catch (e) {
            console.error('Error loading diseases', e);
        }
    }

    function setupDatabase() {
        elements.dbSearchInput.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            const filtered = state.diseases.filter(d => 
                d.name.toLowerCase().includes(q) || 
                d.symptoms.some(s => s.toLowerCase().includes(q))
            );
            renderDiseaseGrid(filtered);
        });
    }

    function renderDiseaseGrid(diseases) {
        elements.diseaseGrid.innerHTML = '';
        diseases.forEach(d => {
            const card = document.createElement('div');
            card.className = 'disease-card';
            
            const symptomsList = d.symptoms.slice(0, 4).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ');
            const drugsList = d.drugs.slice(0, 3).map(dr => dr.name).join(', ') || 'Various';

            card.innerHTML = `
                <h3>${d.name}</h3>
                <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px;">
                    <strong>Symptoms:</strong> ${symptomsList}
                </p>
                <p style="font-size: 0.85rem; color: var(--text-muted);">
                    <strong>Primary Drugs:</strong> ${drugsList}
                </p>
                <div class="tag-group">
                    <span class="tag">⭐ ${d.avg_rating}/10</span>
                    <span class="tag">${d.symptoms.length} Symptoms</span>
                    <span class="tag">${d.drugs.length} Medications</span>
                </div>
            `;

            card.addEventListener('click', () => openModal(d));
            elements.diseaseGrid.appendChild(card);
        });
    }

    // ==========================================
    // MODAL DETAILS VIEW
    // ==========================================
    function setupModal() {
        elements.modalClose.addEventListener('click', closeModal);
        elements.modal.addEventListener('click', (e) => {
            if (e.target === elements.modal) closeModal();
        });
    }

    function openModal(disease) {
        const symptomsFormatted = disease.symptoms.map(s => `<li>${s.charAt(0).toUpperCase() + s.slice(1)}</li>`).join('');
        const drugsFormatted = disease.drugs.map(d => `<li><strong>${d.name}</strong> (${d.rx_otc}) - Rating: ⭐ ${d.rating}/10</li>`).join('');
        const effectsFormatted = disease.side_effects.map(se => `<li>${se}</li>`).join('') || '<li>None listed</li>';

        elements.modalBody.innerHTML = `
            <h2 style="font-family: var(--font-heading); margin-bottom: 12px; color: var(--primary);">${disease.name}</h2>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                <div>
                    <h4 style="color: #a5b4fc; margin-bottom: 6px;">🩺 Key Symptoms</h4>
                    <ul style="margin-left: 18px; font-size: 0.88rem; color: var(--text-main);">${symptomsFormatted}</ul>
                </div>
                <div>
                    <h4 style="color: #a5b4fc; margin-bottom: 6px;">💊 Primary Drugs</h4>
                    <ul style="margin-left: 18px; font-size: 0.88rem; color: var(--text-main);">${drugsFormatted}</ul>
                </div>
            </div>
            <div style="margin-bottom: 16px;">
                <h4 style="color: #a5b4fc; margin-bottom: 6px;">⚠️ Potential Side Effects</h4>
                <ul style="margin-left: 18px; font-size: 0.88rem; color: var(--text-main);">${effectsFormatted}</ul>
            </div>
            <div style="background: rgba(255, 255, 255, 0.05); padding: 12px; border-radius: 8px; font-size: 0.85rem;">
                <p><strong>Affected Body Parts:</strong> ${disease.body_parts.join(', ')}</p>
                <p><strong>Alcohol Advisory:</strong> ${disease.alcohol_warning}</p>
                <p><strong>Patient Rating:</strong> ⭐ ${disease.avg_rating}/10 (${disease.total_reviews} reviews)</p>
            </div>
        `;
        elements.modal.classList.add('active');
    }

    function closeModal() {
        elements.modal.classList.remove('active');
    }

    // ==========================================
    // ANALYTICS & CHARTS
    // ==========================================
    async function loadAnalytics() {
        try {
            const res = await fetch('/api/analytics');
            state.analyticsData = await res.json();
            
            document.getElementById('metricDiseases').textContent = state.analyticsData.total_diseases;
            document.getElementById('metricSymptoms').textContent = state.analyticsData.total_symptoms;
            document.getElementById('metricRecords').textContent = state.analyticsData.total_records;
        } catch (e) {
            console.error('Error loading analytics', e);
        }
    }

    function renderAnalyticsCharts() {
        if (!state.analyticsData) return;

        // Chart 1: Disease Frequency
        if (state.charts.diseases) state.charts.diseases.destroy();
        const ctxDiseases = document.getElementById('chartDiseases').getContext('2d');
        state.charts.diseases = new Chart(ctxDiseases, {
            type: 'bar',
            data: {
                labels: state.analyticsData.top_diseases.map(d => d.name),
                datasets: [{
                    label: 'Patient Case Studies',
                    data: state.analyticsData.top_diseases.map(d => d.count),
                    backgroundColor: 'rgba(99, 102, 241, 0.7)',
                    borderColor: '#6366f1',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: '#9ca3af' } },
                    y: { ticks: { color: '#9ca3af' } }
                }
            }
        });

        // Chart 2: Top Symptoms Frequency
        if (state.charts.symptoms) state.charts.symptoms.destroy();
        const ctxSymptoms = document.getElementById('chartSymptoms').getContext('2d');
        state.charts.symptoms = new Chart(ctxSymptoms, {
            type: 'doughnut',
            data: {
                labels: state.analyticsData.top_symptoms.slice(0, 7).map(s => s.symptom),
                datasets: [{
                    data: state.analyticsData.top_symptoms.slice(0, 7).map(s => s.count),
                    backgroundColor: ['#6366f1', '#10b981', '#ec4899', '#f59e0b', '#8b5cf6', '#06b6d4', '#3b82f6']
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af' } } }
            }
        });

        // Chart 3: Disease Ratings
        if (state.charts.ratings) state.charts.ratings.destroy();
        const ctxRatings = document.getElementById('chartRatings').getContext('2d');
        state.charts.ratings = new Chart(ctxRatings, {
            type: 'line',
            data: {
                labels: state.analyticsData.top_diseases.slice(0, 8).map(d => d.name),
                datasets: [{
                    label: 'Rating (out of 10)',
                    data: state.analyticsData.top_diseases.slice(0, 8).map(d => d.rating),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: '#9ca3af' } },
                    y: { min: 0, max: 10, ticks: { color: '#9ca3af' } }
                }
            }
        });
    }
});
