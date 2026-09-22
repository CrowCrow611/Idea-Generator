const generateBtn = document.getElementById('generate');
const errorEl = document.getElementById('error');
const logEl = document.getElementById('log');
const logHeader = document.getElementById('log-header');
const logCount = document.getElementById('log-count');
const clearBtn = document.getElementById('clear-btn');
const emptyState = document.getElementById('empty-state')
const template = document.getElementById('idea-template')

const baseUrlInput = document.getElementById('base-url');
const keyInput = document.getElementById('key');
const modelText = document.getElementById('model-text');
const nameInput = document.getElementById('name');
const loadModelsBtn = document.getElementById('load-models');

const connect = document.getElementById('connect');
const connectStatus = document.getElementById('connect-status');

const SeenIdeas = new Set();

let ideaCount = 0;

generateBtn.addEventListener('click', generateIdeas);
clearBtn.addEventListener('click', clearLog);
baseUrlInput.addEventListener('input', updateConnectStatus);
keyInput.addEventListener('input', updateConnectStatus);
modelText.addEventListener('input', updateConnectStatus);
nameInput.addEventListener('input', setKickerLine);
loadModelsBtn.addEventListener('click', () => loadModels());

const saved = loadSettings();
setKickerLine();
updateConnectStatus();
connect.open = true;
if (saved.base && saved.key) loadModels(saved.model);

function setKickerLine() {
    const kicker = document.getElementById('kicker');
    const name = nameInput.value.trim();
    const who = name ? `, ${name}` : '';

    const now = new Date();
    const h = now.getHours();
    const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    let line;
    if (h >= 1 && h < 5) {
        line = `it's ${timeStr}${who}. did you sleep? Or were you just on your phone? for god's sake, just go to bed`;
    } else if (h >= 5 && h < 8) {
        line = `it's ${timeStr}${who} - either you're up disgutingly early or you never went to bed... I feel its the latter`;
    } else if (h >= 21 && h < 24) {
        line = `it's ${timeStr}${who}, seems like the submmission closes soon...`;
    } else {
        line = `its ${timeStr}${who}. the yard is open - what are you building?`;
    }

    kicker.textContent = line;
    saveSetting();
}

function updateConnectStatus() {
    const ready = baseUrlInput.value.trim() && keyInput.value.trim() && modelText.value.trim();

    connectStatus.textContent = ready ? 'ready' : 'not cconnected';
    connectStatus.classList.toggle('connected', ready);
    saveSetting();
}

async function generateIdeas() {
    errorEl.textContent = '';

    const base = baseUrlInput.value.trim().replace(/\/+$/, '');
    const key = keyInput.value.trim();
    const model = modelText.value.trim();
    const theme = document.getElementById('theme').value.trim() || 'anything - suprise me';
    const team = document.getElementById('team').value || '2 people';
    const skill = document.getElementById('skill').value || 'beginner';
    const time = document.getElementById('time').value || '24 hours';
    saveSetting();

    if (!base) {
        errorEl.textContent = 'Add your api endpoint.';
        connect.open = true;
        return;
    }

    if (!key) {
        errorEl.textContent = "Add your api key.";
        connect.open = true;
        return;
    }

    if (!model) {
        errorEl.textContent = 'Press Load models and pick a model.';
        connect.open = true;
        return;
    }

    const endpoint = `${base}/chat/completions`;

    connect.open = false;
    setLoading(true);
    const loadingLine = addLoadingLine();

    const prompt = buildPrompt({ theme, team, skill, time })

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: 'Scale every idea\'s scope to the team size and time the user states. If constraints are tight, keep ideas deliberately small. You generate project ideas, concepts only, never implecate. Respond with ONLY valid JSON, no markdown fences. The JSON must be an array of exactly 3 objects, each with keys: name (string, max 6 words), pitch (string, One sectence, max 25 words, no code, no technical implementation steps), stack (string, comma-seperated technology names only - no code, no config, no explanations), stretch (string, ONE sentencce, max 20 words, a feature idea not a tutorial). Never include code blocks, file names, syntax of any programming language, scripting language, step by step instrucations, architecture details. If you catch yourself writing more than one sentence per field, stop and shorten it. These are pitches for ideas, not specs to build from.'    
                    },
                    {role: 'user', content: prompt }
                ],
                temperature: 0.7
            })
        });

        if (!res.ok) {
            const body = await res.text();
            throw new Error(`API error ${res.status}: ${body.slice(0, 200)}`);
        }

        const data = await res.json();
        const raw = data.choices?.[0]?.message?.content ?? '';
        const ideas = parseIdeas(raw, skill);

        loadingLine.remove();

        if (!ideas.length) {
            errorEl.textContent = "The model went too detailed or technical that time... Try again it behaves";
            return;
        }

        ideas.forEach(renderIdea);
        updateLogHeader();
    } catch (err) {
        loadingLine.remove();
        errorEl.textContent = err.message || 'Something went wrong talking to the API. Check your endpoint, key, and model name.';
    } finally {
        setLoading(false);
    }
}

function buildPrompt({ theme, team, skill, time}) {
    let stackRule;
    if (skill.toLowerCase().includes('beginner')) {
        stackRule = 'Stack: max 3 technologies, all low-setup. No Unity, Unreal, AR/VR, mobile apps (Swift, Kotlin,, Flutter, React Native), Three.js, or ML training.';
    } else {
        stackRule = 'Stack: max 5 technologies, minimal setup.';
    }

    return `Generate 3 hackathon project ideas.

    Theme: ${theme}
    Team size: ${team}
    Skill level: ${skill}
    Time available: ${time}
    
    Rules:
    - Buildable by ${team} at ${skill} level in ${time}.Fewer people or less time means smaller scope .
    ${stackRule}
    - mall and finished beats ambitious and broken.
    - Avoid generic "to-do list app" style ideas - make each idea specific and quirky.`;
}

function parseIdeas(raw, skill) {
    let cleaned = raw.trim();
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');

    let ideas = [];
    try {
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) ideas = parsed;
        else if (Array.isArray(parsed.ideas)) ideas = parsed.ideas;
    } catch (e) {
        const match = cleaned.match(/\[[\s\S]*\]/);
        if (match) {
            try {
                ideas = JSON.parse(match[0]);
            } catch (e2) {
                ideas = [];
            }
        }
    }

    return ideas.filter(idea => isConceptLevel(idea, skill));
}

function isConceptLevel(idea, skill) {
    const text = [idea.name, idea.pitch, idea.stretch].filter(Boolean).join(' ');

    const codeSignals = /```|function\s*\(|=>|;\n|<\/?\w+>|import\s+\w+|def\s+\w+\(|class\s+\w+\s*\{|SELECT\s+.*FROM|\{\s*\n/i;
    if (codeSignals.test(text)) return false;

    if ((idea.pitch || '').split(/\s+/).length > 40) return false;
    if ((idea.stretch || '').split(/\s+/).length > 30) return false;
    if (/step \d|1\.\s|first,.*then,.*finally/i.test(idea.pitch || '')) return false;

    if (/beginner/i.test(skill)) {
        const stack = (idea.stack || '').toLowerCase();
        if (/unity|unreal|arfoundation|arkit|arcore|flutter|react native|swift|kotlin|three\.?js|webgl|pytorch|tensorflow|opencv/.test(stack)) return false;
        if (stack.split(',').filter(s => s.trim()).length > 3) return false;
    }
    return true;
}

function renderIdea(idea) {
    ideaCount += 1;
    const node = template.content.cloneNode(true);

    node.querySelector('.idea-index').textContent = String(ideaCount).padStart(2, '0');
    node.querySelector('.idea-name').textContent = idea.name || 'Untitled idea';
    node.querySelector('.idea-pitch').textContent = idea.pitch || '';
    node.querySelector('.idea-stack').textContent = idea.stack || '—';
    node.querySelector('.idea-stretch').textContent = idea.stretch || '—';

    const copyBtn = node.querySelector('.copy-btn');
    copyBtn.addEventListener('click', () => copyIdea(idea, copyBtn));

    logEl.prepend(node);
    emptyState.hidden = true;
}

function copyIdea(idea, btn) {
    const text = `${idea.name}\n${idea.pitch}\nStack: ${idea.stack}\nStretch: ${idea.stretch}`;
    navigator.clipboard.writeText(text).then(() => {

        const label = btn.querySelector('.copy-label');
        const original = label.textContent;
        label.textContent = 'Copied';
        btn.classList.add('copied');
        setTimeout(() => {
            label.textContent = original;
            btn.classList.remove('copied');
        }, 1500);
    }).catch(() => {
        errorEl.textContent = "Could'nt copy - Your browser may be blocking clipboard access.";
    });
}

function addLoadingLine() {
    const div = document.createElement('div');
    div.className = 'loading-line';
    div.innerHTML = 'Thinking up sommething buildable <span class="dots"><i></i><i></i><i></i></span>';
    logEl.prepend(div);
    return div;
}

function updateLogHeader() {
    logHeader.hidden = ideaCount === 0;
    logCount.textContent = `${ideaCount} idea${ideaCount === 1 ? '' : 's'} so far`;
}

function clearLog() {
    logEl.innerHTML = '';
    ideaCount = 0;
    updateLogHeader();
    emptyState.hidden = false;
    SeenIdeas.clear();
}

function setLoading(isLoading) {
    generateBtn.disabled = isLoading;
    generateBtn.classList.toggle('loading', isLoading);
    generateBtn.querySelector('.btn-label').textContent = isLoading ? 'Generating...' : 'Generate ideas';
}

function saveSetting() {
    const s = {
        base: baseUrlInput.value,
        key: keyInput.value,
        model: modelText.value,
        name: nameInput.value,
        theme: document.getElementById('theme').value,
        team: document.getElementById('team').value,
        skill: document.getElementById('skill').value,
        time: document.getElementById('time').value
    };
    localStorage.setItem('sparkyard', JSON.stringify(s));
}

function loadSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem('sparkyard')) || {}; } catch (e) {}
    if (s.base) baseUrlInput.value = s.base;
    if (s.key) keyInput.value = s.key;
    if (s.name) nameInput.value = s.name;
    if (s.theme) document.getElementById('theme').value = s.theme;
    if (s.team) document.getElementById('team').value = s.team;
    if (s.skill) document.getElementById('skill').value = s.skill;
    if (s.time) document.getElementById('time').value = s.time;
    return s;
}

async function loadModels(preselect) {
    const base = baseUrlInput.value.trim().replace(/\/+$/, '');
    const key = keyInput.value.trim();
    if (!base || !key) {
        errorEl.textContent = `First add your endpoint and API key.`;
        return;
    }
    modelText.innerHTML = '<option value="">Loading models...</option>';
    try {
        const res = await fetch(base + '/models', {
            headers: { 'Authorization': 'Bearer ' + key}
        });
        if (!res.ok) throw new Error('API error ' + res.status + ' - check endpoint and key.');
        const data = await res.json();
        const list  = data.data || data.models || [];
        const ids = list.map(m => m.id || m.name).filter(Boolean)
            .filter(id => !/whisper|orpheus|tts|speech|guard|embed|moderation|rerank|transcri|safeguard/i.test(id))
            .sort();
        if (!ids.length) throw new Error('No usable chat models found');
        modelText.innerHTML = '';
        ids.forEach(id => {
            const o = document.createElement('option');
            o.value = id;
            o.textContent = id;
            modelText.appendChild(o);
        });
        if (preselect) modelText.value = preselect;
        if (!modelText.value) modelText.value = ids[0];
    } catch (err) {
        modelText.innerHTML = '<option value="">Could not load models</option>';
        errorEl.textContent = err.message || 'Could not load models.';
    }
    updateConnectStatus();
}
