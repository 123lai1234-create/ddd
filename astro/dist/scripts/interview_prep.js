function switchTab(id, btn) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + id).classList.add('active');
    btn.classList.add('active');
}

function toggleAccordion(header) {
    const acc = header.parentElement;
    acc.classList.toggle('open');
}

// Progress bar
function updateProgress() {
    const boxes = document.querySelectorAll('#tab-checklist input[type="checkbox"]');
    const checked = Array.from(boxes).filter(b => b.checked).length;
    const total = boxes.length;
    document.getElementById('progress-text').textContent = `進度：${checked} / ${total}`;
    document.getElementById('progress-bar').style.width = (checked / total * 100) + '%';
}
document.querySelectorAll('#tab-checklist input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', updateProgress);
});
