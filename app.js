const CONFIG = {
    MATCH_THRESHOLD: 5,
    NEAR_THRESHOLD: 12,
    MAX_OFF_STREAK: 3,
    CHARACTERS_DIR: 'characters/',
    MODES: {
        PRACTICE: 'practice',
        ASSESSMENT: 'assessment'
    },
    STORAGE_KEYS: {
        BEST_STREAK: 'shadow_puppet_best_streak_',
        SAVE_STATE: 'shadow_puppet_save_state_',
        LAST_MODE: 'shadow_puppet_last_mode_',
        LAST_CHARACTER: 'shadow_puppet_last_character'
    }
};

class ShadowPuppetApp {
    constructor() {
        this.state = {
            character: null,
            currentCharacterFile: null,
            currentMode: CONFIG.MODES.PRACTICE,
            modeStates: {
                [CONFIG.MODES.PRACTICE]: {
                    currentStep: 0,
                    currentStreak: 0,
                    bestStreak: 0,
                    consecutiveOff: 0,
                    history: [],
                    jointStats: {},
                    totalDeviation: 0,
                    submissionCount: 0,
                    currentAngles: {}
                },
                [CONFIG.MODES.ASSESSMENT]: {
                    currentStep: 0,
                    currentStreak: 0,
                    bestStreak: 0,
                    consecutiveOff: 0,
                    history: [],
                    jointStats: {},
                    totalDeviation: 0,
                    submissionCount: 0,
                    currentAngles: {}
                }
            }
        };
        this.init();
    }

    get modeState() {
        return this.state.modeStates[this.state.currentMode];
    }

    set modeState(value) {
        this.state.modeStates[this.state.currentMode] = value;
    }

    getStorageKey(baseKey, characterFile) {
        return baseKey + characterFile + '_' + this.state.currentMode;
    }

    isAssessmentMode() {
        return this.state.currentMode === CONFIG.MODES.ASSESSMENT;
    }

    async init() {
        this.loadCharacterList();
        this.bindEvents();
        await this.tryRestoreState();
    }

    async loadCharacterList() {
        try {
            const response = await fetch(CONFIG.CHARACTERS_DIR + 'manifest.json');
            if (response.ok) {
                const manifest = await response.json();
                this.populateCharacterSelect(manifest);
            } else {
                this.populateCharacterSelect([{ file: 'guanyu.json', name: '关公立像' }]);
            }
        } catch (e) {
            this.populateCharacterSelect([{ file: 'guanyu.json', name: '关公立像' }]);
        }
    }

    populateCharacterSelect(characters) {
        const select = document.getElementById('characterSelect');
        select.innerHTML = '';
        characters.forEach(char => {
            const option = document.createElement('option');
            option.value = char.file;
            option.textContent = char.name;
            select.appendChild(option);
        });
    }

    async loadCharacter(filename, restoreFromStorage = true) {
        try {
            let restored = false;
            if (restoreFromStorage) {
                restored = this.restoreStateFromStorage(filename);
            }
            
            const response = await fetch(CONFIG.CHARACTERS_DIR + filename);
            if (!response.ok) throw new Error('加载角色失败');
            
            const character = await response.json();
            this.state.character = character;
            this.state.currentCharacterFile = filename;
            
            if (!restored) {
                this.resetState(false);
            }
            
            this.initializeJointStats();
            this.initializeCurrentAngles();
            this.updateModeIndicator();
            this.render();
            this.showToast(`已加载角色：${character.name}`, 'success');
            
            this.saveState();
            
            return restored;
        } catch (e) {
            this.showToast('加载角色失败：' + e.message, 'error');
            return false;
        }
    }

    initializeJointStats() {
        if (!this.state.character) return;
        
        this.state.character.joints.forEach(joint => {
            if (!this.modeState.jointStats[joint.id]) {
                this.modeState.jointStats[joint.id] = {
                    name: joint.name,
                    match: 0,
                    near: 0,
                    off: 0,
                    total: 0,
                    totalDeviation: 0
                };
            }
        });
    }

    initializeCurrentAngles() {
        if (!this.state.character) return;
        
        const firstSequence = this.state.character.joints[0]?.sequence || [];
        const currentTime = firstSequence[this.modeState.currentStep]?.time || 0;
        
        this.state.character.joints.forEach(joint => {
            const targetPoint = joint.sequence.find(p => p.time === currentTime);
            let initialAngle;
            
            if (this.isAssessmentMode()) {
                initialAngle = (joint.minAngle + joint.maxAngle) / 2;
            } else {
                initialAngle = targetPoint ? targetPoint.angle : 
                              (joint.minAngle + joint.maxAngle) / 2;
            }
            
            if (!(joint.id in this.modeState.currentAngles)) {
                this.modeState.currentAngles[joint.id] = initialAngle;
            }
        });
    }

    getCurrentTimeStep() {
        if (!this.state.character) return null;
        const firstSequence = this.state.character.joints[0]?.sequence || [];
        return firstSequence[this.modeState.currentStep] || null;
    }

    getTotalSteps() {
        if (!this.state.character) return 0;
        return this.state.character.joints[0]?.sequence?.length || 0;
    }

    evaluateAngle(actual, target) {
        const deviation = Math.abs(actual - target);
        if (deviation <= CONFIG.MATCH_THRESHOLD) {
            return { result: 'match', deviation };
        } else if (deviation <= CONFIG.NEAR_THRESHOLD) {
            return { result: 'near', deviation };
        } else {
            return { result: 'off', deviation };
        }
    }

    submit() {
        if (!this.state.character) {
            this.showToast('请先加载角色', 'warning');
            return;
        }

        const timeStep = this.getCurrentTimeStep();
        if (!timeStep) {
            this.showToast('已完成所有步骤', 'success');
            return;
        }

        const currentTime = timeStep.time;
        const jointResults = [];
        let stepHasOff = false;
        let stepDeviation = 0;

        this.state.character.joints.forEach(joint => {
            const targetPoint = joint.sequence.find(p => p.time === currentTime);
            if (!targetPoint) return;

            const actual = this.modeState.currentAngles[joint.id] ?? targetPoint.angle;
            const evaluation = this.evaluateAngle(actual, targetPoint.angle);
            
            jointResults.push({
                jointId: joint.id,
                jointName: joint.name,
                actual,
                target: targetPoint.angle,
                ...evaluation
            });

            const stats = this.modeState.jointStats[joint.id];
            stats.total++;
            stats[evaluation.result]++;
            stats.totalDeviation += evaluation.deviation;

            stepDeviation += evaluation.deviation;
            if (evaluation.result === 'off') {
                stepHasOff = true;
            }
        });

        const avgDeviation = stepDeviation / jointResults.length;
        this.modeState.totalDeviation += stepDeviation;
        this.modeState.submissionCount += jointResults.length;

        if (stepHasOff) {
            this.modeState.consecutiveOff++;
            if (this.modeState.consecutiveOff >= CONFIG.MAX_OFF_STREAK) {
                this.modeState.currentStreak = 0;
                this.modeState.consecutiveOff = 0;
                this.showToast('连续 3 次 off，Streak 已清零！', 'error');
            }
        } else {
            this.modeState.currentStreak++;
            this.modeState.consecutiveOff = 0;
        }

        if (this.modeState.currentStreak > this.modeState.bestStreak) {
            this.modeState.bestStreak = this.modeState.currentStreak;
            this.saveBestStreak();
            this.showToast(`新的最佳 Streak：${this.modeState.bestStreak}！`, 'success');
        }

        const overallResult = stepHasOff ? 'off' : 
                              jointResults.every(r => r.result === 'match') ? 'match' : 'near';

        this.modeState.history.push({
            step: this.modeState.currentStep,
            time: currentTime,
            results: jointResults,
            avgDeviation,
            overallResult,
            streakAfter: this.modeState.currentStreak
        });

        this.modeState.currentStep++;
        this.advanceToNextStep();
        this.saveState();
        this.render();

        if (this.modeState.currentStep >= this.getTotalSteps()) {
            this.showToast('恭喜！已完成所有时间点的练习！', 'success');
        }
    }

    advanceToNextStep() {
        if (this.modeState.currentStep >= this.getTotalSteps()) return;
        
        const timeStep = this.getCurrentTimeStep();
        if (!timeStep) return;

        const currentTime = timeStep.time;
        this.state.character.joints.forEach(joint => {
            const targetPoint = joint.sequence.find(p => p.time === currentTime);
            if (targetPoint) {
                if (this.isAssessmentMode()) {
                    this.modeState.currentAngles[joint.id] = (joint.minAngle + joint.maxAngle) / 2;
                } else {
                    this.modeState.currentAngles[joint.id] = targetPoint.angle;
                }
            }
        });
    }

    undo() {
        if (this.modeState.history.length === 0) {
            this.showToast('没有可撤销的操作', 'warning');
            return;
        }

        const lastEntry = this.modeState.history.pop();
        
        lastEntry.results.forEach(result => {
            const stats = this.modeState.jointStats[result.jointId];
            if (stats && stats.total > 0) {
                stats.total--;
                stats[result.result]--;
                stats.totalDeviation -= result.deviation;
            }
        });

        this.modeState.totalDeviation -= lastEntry.avgDeviation * lastEntry.results.length;
        this.modeState.submissionCount -= lastEntry.results.length;

        this.modeState.currentStep = lastEntry.step;
        this.modeState.currentStreak = this.calculateStreakAfterUndo();
        this.modeState.consecutiveOff = this.calculateConsecutiveOffAfterUndo();

        const timeStep = this.getCurrentTimeStep();
        if (timeStep) {
            const currentTime = timeStep.time;
            this.state.character.joints.forEach(joint => {
                const targetPoint = joint.sequence.find(p => p.time === currentTime);
                if (targetPoint) {
                    if (this.isAssessmentMode()) {
                        this.modeState.currentAngles[joint.id] = (joint.minAngle + joint.maxAngle) / 2;
                    } else {
                        this.modeState.currentAngles[joint.id] = targetPoint.angle;
                    }
                }
            });
        }

        this.saveState();
        this.render();
        this.showToast('已撤销上一步操作', 'success');
    }

    calculateStreakAfterUndo() {
        let streak = 0;
        let consecutiveOff = 0;
        
        for (const entry of this.modeState.history) {
            if (entry.overallResult === 'off') {
                consecutiveOff++;
                if (consecutiveOff >= CONFIG.MAX_OFF_STREAK) {
                    streak = 0;
                    consecutiveOff = 0;
                }
            } else {
                streak++;
                consecutiveOff = 0;
            }
        }
        
        return streak;
    }

    calculateConsecutiveOffAfterUndo() {
        let consecutiveOff = 0;
        
        for (let i = this.modeState.history.length - 1; i >= 0; i--) {
            if (this.modeState.history[i].overallResult === 'off') {
                consecutiveOff++;
            } else {
                break;
            }
        }
        
        return consecutiveOff;
    }

    resetState(saveToStorage = true) {
        this.modeState.currentStep = 0;
        this.modeState.currentStreak = 0;
        this.modeState.consecutiveOff = 0;
        this.modeState.history = [];
        this.modeState.jointStats = {};
        this.modeState.totalDeviation = 0;
        this.modeState.submissionCount = 0;
        this.modeState.currentAngles = {};
        
        if (saveToStorage) {
            this.saveState();
        }
    }

    reset() {
        if (!this.state.character) {
            this.showToast('请先加载角色', 'warning');
            return;
        }

        if (confirm('确定要重置当前模式的进度吗？此操作不可撤销。')) {
            this.resetState();
            this.initializeJointStats();
            this.initializeCurrentAngles();
            this.render();
            this.showToast('已重置当前模式进度', 'success');
        }
    }

    updateAngle(jointId, value) {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
            this.modeState.currentAngles[jointId] = numValue;
            this.updateJointPreview(jointId);
        }
    }

    updateJointPreview(jointId) {
        if (!this.state.character) return;

        const joint = this.state.character.joints.find(j => j.id === jointId);
        const timeStep = this.getCurrentTimeStep();
        if (!joint || !timeStep) return;

        const targetPoint = joint.sequence.find(p => p.time === timeStep.time);
        if (!targetPoint) return;

        const actual = this.modeState.currentAngles[jointId] ?? targetPoint.angle;
        const evaluation = this.evaluateAngle(actual, targetPoint.angle);
        
        if (!this.isAssessmentMode()) {
            const statusEl = document.querySelector(`[data-joint="${jointId}"] .joint-status span:last-child`);
            if (statusEl) {
                statusEl.textContent = `偏差：${evaluation.deviation.toFixed(1)}° (${this.getResultText(evaluation.result)})`;
                statusEl.className = `status-${evaluation.result}`;
            }
        }
    }

    getResultText(result) {
        const texts = {
            match: 'Match',
            near: 'Near',
            off: 'Off'
        };
        return texts[result] || result;
    }

    saveState() {
        if (!this.state.character || !this.state.currentCharacterFile) return;
        
        const saveData = {
            characterFile: this.state.currentCharacterFile,
            currentStep: this.modeState.currentStep,
            currentStreak: this.modeState.currentStreak,
            consecutiveOff: this.modeState.consecutiveOff,
            history: this.modeState.history,
            jointStats: this.modeState.jointStats,
            totalDeviation: this.modeState.totalDeviation,
            submissionCount: this.modeState.submissionCount,
            currentAngles: this.modeState.currentAngles,
            timestamp: Date.now()
        };
        
        try {
            localStorage.setItem(
                this.getStorageKey(CONFIG.STORAGE_KEYS.SAVE_STATE, this.state.currentCharacterFile),
                JSON.stringify(saveData)
            );
            localStorage.setItem(
                CONFIG.STORAGE_KEYS.LAST_MODE + this.state.currentCharacterFile,
                this.state.currentMode
            );
        } catch (e) {
            console.warn('保存状态失败:', e);
        }
    }

    async tryRestoreState() {
        const lastCharacter = localStorage.getItem(CONFIG.STORAGE_KEYS.LAST_CHARACTER);
        if (lastCharacter) {
            const lastMode = localStorage.getItem(CONFIG.STORAGE_KEYS.LAST_MODE + lastCharacter);
            if (lastMode && (lastMode === CONFIG.MODES.PRACTICE || lastMode === CONFIG.MODES.ASSESSMENT)) {
                this.state.currentMode = lastMode;
            }
            document.getElementById('characterSelect').value = lastCharacter;
            const restored = await this.loadCharacter(lastCharacter);
            if (restored) {
                setTimeout(() => this.showToast('已恢复上次进度', 'success'), 500);
            }
        } else {
            await this.loadCharacter('guanyu.json');
        }
    }

    restoreStateFromStorage(filename) {
        try {
            const saved = localStorage.getItem(this.getStorageKey(CONFIG.STORAGE_KEYS.SAVE_STATE, filename));
            if (!saved) return false;
            
            const saveData = JSON.parse(saved);
            
            if (Date.now() - saveData.timestamp > 24 * 60 * 60 * 1000) {
                localStorage.removeItem(this.getStorageKey(CONFIG.STORAGE_KEYS.SAVE_STATE, filename));
                return false;
            }
            
            this.modeState.currentStep = saveData.currentStep;
            this.modeState.currentStreak = saveData.currentStreak;
            this.modeState.consecutiveOff = saveData.consecutiveOff;
            this.modeState.history = saveData.history || [];
            this.modeState.jointStats = saveData.jointStats || {};
            this.modeState.totalDeviation = saveData.totalDeviation || 0;
            this.modeState.submissionCount = saveData.submissionCount || 0;
            this.modeState.currentAngles = saveData.currentAngles || {};
            
            return true;
        } catch (e) {
            console.warn('恢复状态失败:', e);
            return false;
        }
    }

    saveBestStreak() {
        if (!this.state.currentCharacterFile) return;
        
        try {
            const key = this.getStorageKey(CONFIG.STORAGE_KEYS.BEST_STREAK, this.state.currentCharacterFile);
            const currentBest = parseInt(localStorage.getItem(key) || '0');
            
            if (this.modeState.bestStreak > currentBest) {
                localStorage.setItem(key, this.modeState.bestStreak.toString());
            }
        } catch (e) {
            console.warn('保存最佳记录失败:', e);
        }
    }

    loadBestStreak() {
        if (!this.state.currentCharacterFile) return 0;
        
        try {
            const key = this.getStorageKey(CONFIG.STORAGE_KEYS.BEST_STREAK, this.state.currentCharacterFile);
            return parseInt(localStorage.getItem(key) || '0');
        } catch (e) {
            return 0;
        }
    }

    switchMode(mode) {
        if (mode === this.state.currentMode) return;
        if (mode !== CONFIG.MODES.PRACTICE && mode !== CONFIG.MODES.ASSESSMENT) return;

        this.state.currentMode = mode;
        
        if (this.state.currentCharacterFile) {
            const restored = this.restoreStateFromStorage(this.state.currentCharacterFile);
            if (!restored) {
                this.resetState(false);
            }
            this.initializeJointStats();
            this.initializeCurrentAngles();
            this.saveState();
        }
        
        this.updateModeIndicator();
        this.render();
        
        const modeText = mode === CONFIG.MODES.PRACTICE ? '练习' : '考核';
        this.showToast(`已切换到${modeText}模式`, 'success');
    }

    updateModeIndicator() {
        const body = document.body;
        if (this.isAssessmentMode()) {
            body.classList.add('assessment-mode');
        } else {
            body.classList.remove('assessment-mode');
        }

        document.querySelectorAll('.mode-btn').forEach(btn => {
            if (btn.dataset.mode === this.state.currentMode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    render() {
        if (!this.state.character) return;

        this.modeState.bestStreak = Math.max(this.modeState.bestStreak, this.loadBestStreak());

        this.renderStatusPanel();
        this.renderJointStats();
        this.renderJointControls();
        this.renderHistory();
        this.updateButtonStates();
    }

    renderStatusPanel() {
        document.getElementById('currentStreak').textContent = this.modeState.currentStreak;
        document.getElementById('bestStreak').textContent = this.modeState.bestStreak;
        document.getElementById('currentStep').textContent = this.modeState.currentStep;
        document.getElementById('totalSteps').textContent = this.getTotalSteps();

        const timeStep = this.getCurrentTimeStep();
        document.getElementById('currentTime').textContent = timeStep ? `${timeStep.time}s` : '完成';
    }

    renderJointStats() {
        const grid = document.getElementById('jointStats');
        grid.innerHTML = '';

        this.state.character.joints.forEach(joint => {
            const stats = this.modeState.jointStats[joint.id];
            const matchRate = stats.total > 0 ? ((stats.match / stats.total) * 100).toFixed(1) : 0;
            const avgDev = stats.total > 0 ? (stats.totalDeviation / stats.total).toFixed(1) : 0;

            const card = document.createElement('div');
            card.className = 'joint-stat-card';
            card.innerHTML = `
                <h3>${stats.name}</h3>
                <div class="stat-row"><span>Match 次数：</span><span>${stats.match}</span></div>
                <div class="stat-row"><span>Near 次数：</span><span>${stats.near}</span></div>
                <div class="stat-row"><span>Off 次数：</span><span>${stats.off}</span></div>
                <div class="stat-row"><span>Match 占比：</span><span>${matchRate}%</span></div>
                <div class="stat-row"><span>平均偏差：</span><span>${avgDev}°</span></div>
            `;
            grid.appendChild(card);
        });

        const overallMatchRate = this.modeState.submissionCount > 0 
            ? ((Object.values(this.modeState.jointStats).reduce((sum, s) => sum + s.match, 0) / this.modeState.submissionCount) * 100).toFixed(1)
            : 0;
        const overallAvgDev = this.modeState.submissionCount > 0 
            ? (this.modeState.totalDeviation / this.modeState.submissionCount).toFixed(1)
            : 0;

        document.getElementById('overallMatchRate').textContent = `${overallMatchRate}%`;
        document.getElementById('avgDeviation').textContent = `${overallAvgDev}°`;
    }

    renderJointControls() {
        const container = document.getElementById('jointControls');
        container.innerHTML = '';

        const timeStep = this.getCurrentTimeStep();
        if (!timeStep) {
            container.innerHTML = '<div style="text-align: center; color: #2ecc71; padding: 40px;">所有时间点已完成！可以重置重新练习。</div>';
            return;
        }

        const currentTime = timeStep.time;
        const isAssessment = this.isAssessmentMode();

        this.state.character.joints.forEach(joint => {
            const targetPoint = joint.sequence.find(p => p.time === currentTime);
            if (!targetPoint) return;

            const currentAngle = this.modeState.currentAngles[joint.id] ?? (isAssessment ? (joint.minAngle + joint.maxAngle) / 2 : targetPoint.angle);
            const evaluation = this.evaluateAngle(currentAngle, targetPoint.angle);

            const control = document.createElement('div');
            control.className = 'joint-control';
            control.dataset.joint = joint.id;
            
            let targetAngleHtml = '';
            if (!isAssessment) {
                targetAngleHtml = `<span class="target-angle">目标：${targetPoint.angle}°</span>`;
            }

            let statusHtml = `<span>范围：${joint.minAngle}° - ${joint.maxAngle}°</span>`;
            if (!isAssessment) {
                statusHtml += `<span class="status-${evaluation.result}">偏差：${evaluation.deviation.toFixed(1)}° (${this.getResultText(evaluation.result)})</span>`;
            }

            control.innerHTML = `
                <div class="joint-control-header">
                    <span class="joint-name">${joint.name}</span>
                    ${targetAngleHtml}
                </div>
                <div class="slider-container">
                    <input type="range" 
                           id="slider-${joint.id}"
                           min="${joint.minAngle}" 
                           max="${joint.maxAngle}" 
                           value="${currentAngle}"
                           step="1">
                    <input type="number" 
                           id="input-${joint.id}"
                           class="angle-input"
                           min="${joint.minAngle}" 
                           max="${joint.maxAngle}" 
                           value="${currentAngle}"
                           step="1">
                </div>
                <div class="joint-status">
                    ${statusHtml}
                </div>
            `;
            container.appendChild(control);

            const slider = control.querySelector(`#slider-${joint.id}`);
            const input = control.querySelector(`#input-${joint.id}`);

            slider.addEventListener('input', (e) => {
                input.value = e.target.value;
                this.updateAngle(joint.id, e.target.value);
            });

            input.addEventListener('input', (e) => {
                let val = parseFloat(e.target.value);
                if (val < joint.minAngle) val = joint.minAngle;
                if (val > joint.maxAngle) val = joint.maxAngle;
                slider.value = val;
                this.updateAngle(joint.id, val);
            });
        });
    }

    renderHistory() {
        const list = document.getElementById('historyList');
        
        if (this.modeState.history.length === 0) {
            list.innerHTML = '<div style="text-align: center; color: #888; padding: 40px;">暂无操作记录</div>';
            return;
        }

        list.innerHTML = '';
        
        [...this.modeState.history].reverse().forEach(entry => {
            const item = document.createElement('div');
            item.className = `history-item ${entry.overallResult}`;
            
            const jointsHtml = entry.results.map(r => `
                <span class="history-joint status-${r.result}">
                    ${r.jointName}: ${r.actual.toFixed(0)}° → ${r.target}° (${r.result})
                </span>
            `).join('');

            item.innerHTML = `
                <div class="history-time">${entry.time}s</div>
                <div class="history-joints">${jointsHtml}</div>
                <div class="history-streak ${entry.overallResult === 'off' ? 'off' : ''}">
                    Streak: ${entry.streakAfter}
                </div>
            `;
            list.appendChild(item);
        });
    }

    updateButtonStates() {
        document.getElementById('submitBtn').disabled = this.modeState.currentStep >= this.getTotalSteps();
        document.getElementById('undoBtn').disabled = this.modeState.history.length === 0;
    }

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    bindEvents() {
        document.getElementById('loadCharacterBtn').addEventListener('click', async () => {
            const filename = document.getElementById('characterSelect').value;
            this.resetState(false);
            const restored = await this.loadCharacter(filename);
            localStorage.setItem(CONFIG.STORAGE_KEYS.LAST_CHARACTER, filename);
            if (restored) {
                this.showToast('已恢复上次进度', 'success');
            }
        });

        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                this.switchMode(mode);
            });
        });

        document.getElementById('submitBtn').addEventListener('click', () => this.submit());
        document.getElementById('undoBtn').addEventListener('click', () => this.undo());
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.target.matches('input')) {
                e.preventDefault();
                this.submit();
            } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.undo();
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new ShadowPuppetApp();
});
