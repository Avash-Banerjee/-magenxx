/* ═══════════════════════════════════════
   FitScan — PDF Export (jsPDF)
   ═══════════════════════════════════════ */

// ─────────────────────────────────────────
//  SHARED HELPERS
// ─────────────────────────────────────────
function pdfAddPageIfNeeded(doc, y, margin, pageH) {
    if (y + margin > pageH - 20) { doc.addPage(); return margin; }
    return y;
}

function pdfHeader(doc, title, subtitle, bodyType, goal) {
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFillColor(6, 182, 212);
    doc.rect(0, 0, pageW, 36, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('FitScan', 14, 14);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(title, 14, 23);
    doc.setFontSize(9);
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.text(today, pageW - 14, 14, { align: 'right' });
    if (bodyType) doc.text(`Body Type: ${bodyType}`, pageW - 14, 22, { align: 'right' });
    if (goal)     doc.text(`Goal: ${goal}`, pageW - 14, 30, { align: 'right' });
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    if (subtitle) doc.text(subtitle, 14, 44);
    return 50;
}

function pdfSectionTitle(doc, text, y, pageW) {
    doc.setFillColor(236, 254, 255);
    doc.rect(10, y - 5, pageW - 20, 12, 'F');
    doc.setTextColor(6, 182, 212);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(text, 14, y + 3);
    return y + 14;
}

function pdfLine(doc, y, pageW) {
    doc.setDrawColor(226, 232, 240);
    doc.line(14, y, pageW - 14, y);
    return y + 4;
}


// ─────────────────────────────────────────
//  EXERCISE PDF
// ─────────────────────────────────────────
function exportExercisePDF() {
    if (!planData) { alert("No exercise plan loaded. Please generate a plan first."); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;
    let y = pdfHeader(doc, 'Weekly Exercise Plan', planData.plan_summary || '', '', '');
    if (planData.weekly_notes) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(100, 116, 139);
        const notes = doc.splitTextToSize(planData.weekly_notes, pageW - 28);
        doc.text(notes, margin, y);
        y += notes.length * 4.5 + 6;
    }
    (planData.weekly_plan || []).forEach(day => {
        y = pdfAddPageIfNeeded(doc, y, margin, pageH);
        doc.setFillColor(30, 41, 59);
        doc.rect(margin, y - 2, pageW - margin * 2, 10, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
        doc.text(`${day.day}  —  ${day.focus || ''}`, margin + 3, y + 5);
        if (!day.is_rest_day && day.estimated_duration_min) {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
            doc.text(`~${day.estimated_duration_min} min`, pageW - margin - 3, y + 5, { align: 'right' });
        }
        y += 13;
        if (day.is_rest_day) {
            doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5);
            const rt = doc.splitTextToSize(day.warmup || 'Rest and recover.', pageW - 28);
            doc.text(rt, margin, y); y += rt.length * 4.5 + 6; return;
        }
        if (day.warmup) {
            doc.setTextColor(16, 185, 129); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
            doc.text('WARMUP:', margin, y);
            doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
            const wl = doc.splitTextToSize(day.warmup, pageW - 42);
            doc.text(wl, margin + 18, y); y += Math.max(wl.length * 4, 5) + 4;
        }
        doc.setFillColor(248, 250, 252); doc.rect(margin, y, pageW - margin * 2, 7, 'F');
        doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
        doc.text('#', margin + 2, y + 4.8); doc.text('Exercise', margin + 8, y + 4.8);
        doc.text('Sets × Reps', margin + 100, y + 4.8); doc.text('Rest', margin + 130, y + 4.8);
        doc.text('Impact', margin + 148, y + 4.8); y += 9;
        (day.exercises || []).forEach((ex, ei) => {
            y = pdfAddPageIfNeeded(doc, y, margin, pageH);
            const bg = ei % 2 === 0 ? [255, 255, 255] : [248, 250, 252];
            doc.setFillColor(...bg); doc.rect(margin, y, pageW - margin * 2, 7, 'F');
            doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
            doc.text(`${ei + 1}`, margin + 2, y + 4.8); doc.text(ex.name || '', margin + 8, y + 4.8);
            doc.setFont('helvetica', 'bold'); doc.text(`${ex.sets}×${ex.reps}`, margin + 100, y + 4.8);
            doc.setFont('helvetica', 'normal'); doc.text(`${ex.rest_seconds}s`, margin + 130, y + 4.8);
            const bc = ex.benefit_rating === 'high' ? [16,185,129] : ex.benefit_rating === 'medium' ? [245,158,11] : [59,130,246];
            doc.setTextColor(...bc); doc.setFont('helvetica', 'bold');
            doc.text(ex.benefit_rating === 'high' ? '★ HIGH' : ex.benefit_rating === 'medium' ? '◆ MED' : '● LOW', margin + 148, y + 4.8);
            y += 7;
        });
        if (day.cooldown) {
            y += 2; doc.setTextColor(59, 130, 246); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
            doc.text('COOLDOWN:', margin, y);
            doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
            const cl = doc.splitTextToSize(day.cooldown, pageW - 44);
            doc.text(cl, margin + 22, y); y += Math.max(cl.length * 4, 5) + 4;
        }
        y += 5;
    });
    const tp = doc.internal.getNumberOfPages();
    for (let i = 1; i <= tp; i++) {
        doc.setPage(i);
        doc.setDrawColor(6, 182, 212); doc.line(10, pageH - 10, pageW - 10, pageH - 10);
        doc.setTextColor(148, 163, 184); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.text('Generated by FitScan — fitscan.app', margin, pageH - 5);
        doc.text(`Page ${i} of ${tp}`, pageW - margin, pageH - 5, { align: 'right' });
    }
    doc.save('FitScan_Exercise_Plan.pdf');
    const pdfBtn = document.getElementById('btnPdfExport');
    if (pdfBtn) pdfBtn.style.display = 'inline-flex';
}


// ─────────────────────────────────────────
//  DIET PDF
// ─────────────────────────────────────────
function exportDietPDF() {
    if (!dietPlan) { alert("No diet plan loaded. Please generate a plan first."); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;
    const macro = dietPlan.macro_split || {};
    let y = pdfHeader(doc, 'Weekly Diet Plan',
        `${dietPlan.daily_calories || 0} kcal/day — ${macro.protein_g || 0}g Protein · ${macro.carbs_g || 0}g Carbs · ${macro.fats_g || 0}g Fats`, '', '');
    if (dietPlan.plan_summary) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(100, 116, 139);
        const sl = doc.splitTextToSize(dietPlan.plan_summary, pageW - 28);
        doc.text(sl, margin, y); y += sl.length * 4.5 + 6;
    }
    doc.setFillColor(236, 254, 255); doc.rect(margin, y, pageW - margin * 2, 18, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(6, 182, 212);
    doc.text('DAILY TARGETS', margin + 4, y + 7);
    doc.setFontSize(8); doc.setTextColor(30, 41, 59);
    const cols = [
        `Calories: ${dietPlan.daily_calories || 0} kcal`,
        `Protein: ${macro.protein_g || 0}g (${macro.protein_pct || 0}%)`,
        `Carbs: ${macro.carbs_g || 0}g (${macro.carbs_pct || 0}%)`,
        `Fats: ${macro.fats_g || 0}g (${macro.fats_pct || 0}%)`,
    ];
    const colW2 = (pageW - margin * 2 - 8) / cols.length;
    cols.forEach((text, i) => doc.text(text, margin + 4 + i * colW2, y + 15));
    y += 24;
    (dietPlan.days || []).forEach(day => {
        y = pdfAddPageIfNeeded(doc, y, margin, pageH);
        doc.setFillColor(30, 41, 59); doc.rect(margin, y - 2, pageW - margin * 2, 10, 'F');
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
        doc.text(`${day.day}`, margin + 3, y + 5);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        doc.text(`${day.total_calories || 0} kcal`, pageW - margin - 3, y + 5, { align: 'right' });
        y += 13;
        (day.meals || []).forEach((meal, mi) => {
            y = pdfAddPageIfNeeded(doc, y, margin, pageH);
            doc.setFillColor(248, 250, 252); doc.rect(margin, y, pageW - margin * 2, 8, 'F');
            doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
            doc.text(`${meal.meal_name}`, margin + 3, y + 5.5);
            if (meal.time) { doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(100, 116, 139); doc.text(meal.time, margin + 60, y + 5.5); }
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(6, 182, 212);
            doc.text(`${meal.total_calories || 0} kcal`, pageW - margin - 3, y + 5.5, { align: 'right' });
            y += 10;
            (meal.items || []).forEach((item, ii) => {
                y = pdfAddPageIfNeeded(doc, y, margin, pageH);
                doc.setFillColor(ii % 2 === 0 ? 255 : 250, ii % 2 === 0 ? 255 : 250, ii % 2 === 0 ? 255 : 252);
                doc.rect(margin + 4, y, pageW - margin * 2 - 4, 6, 'F');
                doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
                doc.text(item.food || '', margin + 7, y + 4.2);
                doc.setTextColor(100, 116, 139);
                doc.text(item.portion || '', margin + 85, y + 4.2);
                doc.text(`${item.calories || 0} cal`, margin + 120, y + 4.2);
                doc.text(`P:${(item.protein_g||0).toFixed(0)}g  C:${(item.carbs_g||0).toFixed(0)}g  F:${(item.fats_g||0).toFixed(0)}g`, pageW - margin - 3, y + 4.2, { align: 'right' });
                y += 6;
            });
            y += 4;
        });
        y += 4;
    });
    if (dietPlan.grocery_list && Object.keys(dietPlan.grocery_list).length > 0) {
        doc.addPage();
        let gy = pdfHeader(doc, 'Weekly Grocery List', 'Everything you need for the week', '', '');
        for (const [cat, items] of Object.entries(dietPlan.grocery_list)) {
            if (!items || items.length === 0) continue;
            gy = pdfAddPageIfNeeded(doc, gy, margin, pageH);
            const label = cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            doc.setFillColor(236, 254, 255); doc.rect(margin, gy - 3, pageW - margin * 2, 9, 'F');
            doc.setTextColor(6, 182, 212); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
            doc.text(label, margin + 3, gy + 3); gy += 10;
            const cc = 3, cw = (pageW - margin * 2) / cc;
            items.forEach((item, i) => {
                gy = pdfAddPageIfNeeded(doc, gy, margin, pageH);
                const col = i % cc;
                if (col === 0 && i > 0) gy += 5.5;
                doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
                doc.text(`• ${item}`, margin + col * cw, gy);
                if (col === cc - 1 || i === items.length - 1) gy += 5.5;
            });
            gy += 4;
        }
    }
    const tp = doc.internal.getNumberOfPages();
    for (let i = 1; i <= tp; i++) {
        doc.setPage(i);
        doc.setDrawColor(6, 182, 212); doc.line(10, pageH - 10, pageW - 10, pageH - 10);
        doc.setTextColor(148, 163, 184); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.text('Generated by FitScan — fitscan.app', margin, pageH - 5);
        doc.text(`Page ${i} of ${tp}`, pageW - margin, pageH - 5, { align: 'right' });
    }
    doc.save('FitScan_Diet_Plan.pdf');
}


// ═══════════════════════════════════════════════════════════════
//  SCAN REPORT PDF  —  Full Comprehensive Health Report
// ═══════════════════════════════════════════════════════════════

async function exportScanPDF() {
    const scan    = (typeof SCAN_DATA    !== 'undefined') ? SCAN_DATA    : {};
    const profile = (typeof PROFILE_DATA !== 'undefined') ? PROFILE_DATA : {};
    const goals   = (typeof GOALS_DATA   !== 'undefined') ? GOALS_DATA   : [];
    const name    = (typeof USER_NAME    !== 'undefined') ? USER_NAME    : 'User';

    // Notify user it's loading
    const btn = document.querySelector('[onclick="exportScanPDF()"]');
    const origText = btn ? btn.textContent : '';
    if (btn) { btn.textContent = '⏳ Building Report...'; btn.disabled = true; }

    // Fetch exercise & diet plans in parallel
    let exPlan = null, dietPlanData = null;
    try {
        const [exResp, dietResp] = await Promise.all([
            fetch('/api/exercise/plan/latest').then(r => r.json()).catch(() => null),
            fetch('/api/diet/plan/latest').then(r => r.json()).catch(() => null),
        ]);
        if (exResp && !exResp.error)   exPlan      = exResp;
        if (dietResp && !dietResp.error) dietPlanData = dietResp;
    } catch(e) { /* plans optional */ }

    if (btn) { btn.textContent = origText; btn.disabled = false; }

    const { jsPDF } = window.jspdf;
    const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const M     = 14;   // margin
    const CW    = pageW - M * 2;

    const today    = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const scanDate = scan.scanned_at ? scan.scanned_at.slice(0, 10) : today;
    const bt       = scan.body_type || 'Unknown';
    const btColors = { Endomorph: [239, 68, 68], Mesomorph: [16, 185, 129], Ectomorph: [59, 130, 246], Unknown: [100, 116, 139] };
    const btCol    = btColors[bt] || [6, 182, 212];

    const hmr           = (scan.hmr_data && typeof scan.hmr_data === 'object') ? scan.hmr_data : {};
    const m_cm          = hmr.measurements_cm || {};
    const hmrRatios     = hmr.ratios || {};
    const derivedRatios = hmr.derived_ratios || {};
    const estFields     = hmr.estimated_fields || [];
    const pose          = (scan.pose_data && typeof scan.pose_data === 'object') ? scan.pose_data : {};
    const j_cm          = pose.joint_lengths_cm || {};
    const skeletalRatios = pose.skeletal_ratios || {};
    const symScores     = pose.symmetry_scores || {};
    const proportions   = pose.body_proportions || {};
    const jointAngles   = pose.joint_angles_deg || {};
    const structAngles  = pose.structural_angles_deg || {};

    const endo = scan.endomorphy || 0;
    const meso = scan.mesomorphy || 0;
    const ecto = scan.ectomorphy || 0;
    const bmi  = scan.bmi || 0;

    // ── Internal draw helpers ────────────────────────────────

    function chk(y, need = 14) {
        if (y + need > pageH - 16) { doc.addPage(); return M + 4; }
        return y;
    }

    function secHead(y, num, label, color = [6, 182, 212]) {
        y = chk(y, 12);
        doc.setFillColor(...color);
        doc.rect(M, y, CW, 8, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
        doc.text(`${num}  ${label.toUpperCase()}`, M + 3, y + 5.5);
        return y + 11;
    }

    function subHead(y, label) {
        y = chk(y, 8);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(6, 182, 212);
        doc.text(label, M + 3, y + 5);
        doc.setDrawColor(6, 182, 212); doc.line(M, y + 7, M + CW, y + 7);
        return y + 10;
    }

    function kv(y, label, value, alt = false) {
        y = chk(y, 7);
        if (alt) { doc.setFillColor(248, 250, 252); doc.rect(M, y - 1, CW, 7, 'F'); }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.2); doc.setTextColor(71, 85, 105);
        doc.text(label, M + 3, y + 4);
        doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
        doc.text(String(value), pageW - M - 3, y + 4, { align: 'right' });
        doc.setDrawColor(226, 232, 240); doc.line(M, y + 6.5, pageW - M, y + 6.5);
        return y + 7;
    }

    function grid4(y, items, alt = false) {
        y = chk(y, 12);
        if (alt) { doc.setFillColor(248, 250, 252); doc.rect(M, y - 1, CW, 12, 'F'); }
        const cw = CW / items.length;
        items.forEach((item, i) => {
            const x = M + i * cw;
            doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
            doc.text(item.label, x + 3, y + 4);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(15, 23, 42);
            doc.text(String(item.value), x + 3, y + 10);
        });
        doc.setDrawColor(226, 232, 240); doc.line(M, y + 12, pageW - M, y + 12);
        return y + 14;
    }

    function barRow(y, label, value, max, color, suffix = '') {
        y = chk(y, 10);
        const bW = CW - 65;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(71, 85, 105);
        doc.text(label, M + 3, y + 5);
        doc.setFillColor(226, 232, 240); doc.roundedRect(M + 58, y + 1.5, bW, 5, 2, 2, 'F');
        const fill = Math.min(value / max, 1) * bW;
        doc.setFillColor(...color); doc.roundedRect(M + 58, y + 1.5, fill, 5, 2, 2, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...color);
        doc.text(`${typeof value === 'number' ? value.toFixed(2) : value}${suffix}`, pageW - M - 3, y + 5.5, { align: 'right' });
        return y + 9;
    }

    function symBar(y, label, ratio, assessment) {
        y = chk(y, 9);
        const pct = Math.min(Math.round(ratio * 100), 100);
        const bW  = CW - 75;
        const col = pct >= 95 ? [16,185,129] : pct >= 85 ? [245,158,11] : [239,68,68];
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(71, 85, 105);
        doc.text(label, M + 3, y + 5);
        doc.setFillColor(226, 232, 240); doc.roundedRect(M + 62, y + 1.5, bW, 5, 2, 2, 'F');
        doc.setFillColor(...col); doc.roundedRect(M + 62, y + 1.5, bW * pct / 100, 5, 2, 2, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...col);
        doc.text(`${pct}% — ${assessment}`, pageW - M - 3, y + 5.5, { align: 'right' });
        return y + 9;
    }

    function infoBox(y, lines, bgColor = [236, 254, 255], textColor = [30, 41, 59]) {
        y = chk(y, lines.length * 5 + 10);
        const lineH = 4.8;
        const boxH  = lines.length * lineH + 8;
        doc.setFillColor(...bgColor); doc.rect(M, y, CW, boxH, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...textColor);
        lines.forEach((line, i) => doc.text(line, M + 4, y + 6 + i * lineH));
        return y + boxH + 4;
    }

    function wrapText(y, text, indent = 0, fontSize = 8, color = [71, 85, 105]) {
        y = chk(y, 10);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(fontSize); doc.setTextColor(...color);
        const lines = doc.splitTextToSize(text, CW - indent - 3);
        doc.text(lines, M + indent + 3, y + 4);
        return y + lines.length * (fontSize * 0.45 + 1) + 3;
    }

    function bulletList(y, items, color = [71, 85, 105]) {
        items.forEach(item => {
            y = chk(y, 7);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...color);
            const lines = doc.splitTextToSize(`• ${item}`, CW - 10);
            doc.text(lines, M + 5, y + 4);
            y += lines.length * 5 + 1;
        });
        return y + 2;
    }

    function pageFooter(doc, pageH, M, pageW) {
        doc.setDrawColor(6, 182, 212); doc.line(10, pageH - 10, pageW - 10, pageH - 10);
        doc.setTextColor(148, 163, 184); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.text('FitScan Health & Fitness Report — Confidential', M, pageH - 5);
        doc.text(`Page ${doc.internal.getCurrentPageInfo().pageNumber}`, pageW - M, pageH - 5, { align: 'right' });
    }

    // ────────────────────────────────────────────────────────
    //  COVER PAGE
    // ────────────────────────────────────────────────────────
    // Full-height gradient header block
    doc.setFillColor(6, 182, 212);
    doc.rect(0, 0, pageW, 70, 'F');
    doc.setFillColor(3, 105, 161);
    doc.rect(0, 48, pageW, 22, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(28);
    doc.text('FitScan', M, 22);
    doc.setFontSize(13); doc.setFont('helvetica', 'normal');
    doc.text('Complete Health & Fitness Report', M, 33);
    doc.setFontSize(8.5);
    doc.text(`Prepared for: ${name}   •   Scan Date: ${scanDate}   •   Generated: ${today}`, M, 43);

    // Body type badge
    doc.setFillColor(...btCol);
    doc.roundedRect(pageW - M - 52, 7, 52, 18, 4, 4, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(255, 255, 255);
    doc.text(bt, pageW - M - 26, 17, { align: 'center' });
    doc.setFontSize(7); doc.text('Body Type', pageW - M - 26, 23, { align: 'center' });

    // Report includes strip
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(186, 230, 253);
    doc.text('REPORT INCLUDES:', M, 56);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(224, 242, 254);
    doc.text('Body Analysis  •  Somatotype  •  All Measurements  •  Symmetry  •  Exercise Plan  •  Diet & Nutrition  •  Action Plan', M, 63);

    // 4-stat hero row
    const statY = 78;
    const bmiCat = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
    const sh = m_cm.shoulder || 0, wa = m_cm.waist || 0, hi = m_cm.hip || 0, ch = m_cm.chest || 0;
    const shr = hi > 0 ? sh / hi : 0, whr = hi > 0 ? wa / hi : 0, stw = wa > 0 ? sh / wa : 0, ctw = wa > 0 ? ch / wa : 1;
    let bodyShape = 'Unknown';
    if (sh > 0 && wa > 0 && hi > 0) {
        if (whr > 1.05 && stw < 1.05) bodyShape = 'Oval';
        else if (shr >= 1.15 && stw >= 1.30) bodyShape = 'Inv. Triangle';
        else if (shr < 0.95) bodyShape = 'Triangle';
        else if (shr >= 1.05 && ctw >= 1.10) bodyShape = 'Trapezoid';
        else bodyShape = 'Rectangle';
    }

    const heroStats = [
        { label: 'BMI', value: bmi > 0 ? bmi.toFixed(1) : '—', sub: bmiCat },
        { label: 'Body Type', value: bt, sub: scan.classification || '' },
        { label: 'Body Shape', value: bodyShape, sub: 'Silhouette' },
        { label: 'Muscle Score', value: Math.min(99, Math.round(meso * 13.3)) + '/100', sub: 'Mesomorphy-based' },
    ];
    const hw = CW / 4;
    heroStats.forEach((s, i) => {
        const x = M + i * hw;
        doc.setFillColor(i % 2 === 0 ? 248 : 241, i % 2 === 0 ? 250 : 245, i % 2 === 0 ? 252 : 255);
        doc.rect(x, statY, hw - 2, 26, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
        doc.text(s.label, x + hw / 2 - 1, statY + 6, { align: 'center' });
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(15, 23, 42);
        doc.text(String(s.value), x + hw / 2 - 1, statY + 15, { align: 'center' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(100, 116, 139);
        doc.text(s.sub, x + hw / 2 - 1, statY + 21, { align: 'center' });
    });

    // Table of contents
    let y = statY + 34;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(6, 182, 212);
    doc.text('REPORT CONTENTS', M, y); y += 6;
    doc.setDrawColor(6, 182, 212); doc.line(M, y, M + CW, y); y += 5;
    const toc = [
        'Section 1   Personal Profile & Anthropometrics',
        'Section 2   Somatotype Analysis',
        'Section 3   Body Composition & BMI',
        'Section 4   Body Shape Classification',
        'Section 5   Body Circumferences (13 measurements)',
        'Section 6   Limb Lengths & Skeletal Proportions',
        'Section 7   Body Ratios & Indices',
        'Section 8   Symmetry Analysis',
        'Section 8b  Joint & Structural Angles',
        'Section 9   Training Recommendations',
        'Section 10  Weekly Exercise Plan',
        'Section 11  Nutrition & Calorie Analysis',
        'Section 12  Weekly Diet Chart',
        'Section 13  Recovery & Lifestyle Protocol',
        'Section 14  30-Day Action Plan',
    ];
    const halfToc = Math.ceil(toc.length / 2);
    toc.forEach((item, i) => {
        const col = i < halfToc ? 0 : 1;
        const row = col === 0 ? i : i - halfToc;
        const tx = M + col * (CW / 2) + 3;
        const ty = y + row * 7;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(30, 41, 59);
        doc.text(item, tx, ty);
    });

    // ────────────────────────────────────────────────────────
    //  SECTION 1: PERSONAL PROFILE
    // ────────────────────────────────────────────────────────
    doc.addPage();
    y = M + 4;
    y = secHead(y, '1.', 'Personal Profile', [30, 41, 59]);

    // Profile grid
    y = grid4(y, [
        { label: 'Full Name',   value: name },
        { label: 'Age',         value: profile.age ? profile.age + ' yrs' : '—' },
        { label: 'Gender',      value: profile.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : '—' },
        { label: 'Experience',  value: profile.experience_level ? profile.experience_level.charAt(0).toUpperCase() + profile.experience_level.slice(1) : '—' },
    ]);
    y = grid4(y, [
        { label: 'Height',         value: profile.height_cm ? profile.height_cm + ' cm' : '—' },
        { label: 'Weight',         value: profile.weight_kg ? profile.weight_kg + ' kg' : '—' },
        { label: 'Target Weight',  value: profile.target_weight ? profile.target_weight + ' kg' : '—' },
        { label: 'Activity Level', value: profile.activity_level ? profile.activity_level.replace(/_/g,' ') : '—' },
    ], true);
    y += 3;

    // Goals
    if (goals && goals.length > 0) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(6, 182, 212);
        doc.text('Fitness Goals:', M + 3, y + 4); y += 8;
        goals.forEach((g, i) => {
            doc.setFillColor(236, 254, 255); doc.roundedRect(M + 3 + i * 58, y, 54, 9, 3, 3, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(6, 182, 212);
            doc.text(g.replace(/_/g, ' ').toUpperCase(), M + 30 + i * 58, y + 6, { align: 'center' });
        });
        y += 14;
    }

    // BMR / TDEE calculation box
    const wKg = parseFloat(profile.weight_kg) || 70;
    const hCm = parseFloat(profile.height_cm) || 170;
    const age  = parseInt(profile.age) || 25;
    const gend = (profile.gender || 'male').toLowerCase();
    const bmrVal = gend.includes('f') ? (10 * wKg + 6.25 * hCm - 5 * age - 161) : (10 * wKg + 6.25 * hCm - 5 * age + 5);
    const actMult = { sedentary:1.2, light:1.375, moderate:1.55, active:1.725, very_active:1.9 };
    const mult = actMult[(profile.activity_level || 'moderate')] || 1.55;
    const tdeeVal = bmrVal * mult;
    y += 2;
    y = subHead(y, 'Metabolic Calculations (Mifflin-St Jeor)');
    y = grid4(y, [
        { label: 'BMR (Base Metabolic Rate)', value: Math.round(bmrVal) + ' kcal/day' },
        { label: 'TDEE (Total Daily Energy)', value: Math.round(tdeeVal) + ' kcal/day' },
        { label: 'Activity Multiplier', value: mult + '×' },
        { label: 'Ideal BMI Weight Range', value: `${(18.5 * (hCm/100)**2).toFixed(0)}–${(24.9 * (hCm/100)**2).toFixed(0)} kg` },
    ]);

    // Scan metadata
    y += 3;
    y = kv(y, 'Scan Date', scanDate);
    y = kv(y, 'Report Generated', today, true);
    y = kv(y, 'Landmarks Detected', pose.landmarks_detected ? pose.landmarks_detected + ' / 33' : '—');
    y = kv(y, 'px per cm (scan calibration)', pose.px_per_cm ? pose.px_per_cm.toFixed(2) : '—', true);
    y += 5;

    // ────────────────────────────────────────────────────────
    //  SECTION 2: SOMATOTYPE ANALYSIS
    // ────────────────────────────────────────────────────────
    y = secHead(y, '2.', 'Somatotype Analysis');
    y = grid4(y, [
        { label: 'Body Type',      value: bt },
        { label: 'Classification', value: scan.classification || '—' },
        { label: 'Somatotype',     value: scan.somatotype_rating || `${endo.toFixed(1)}-${meso.toFixed(1)}-${ecto.toFixed(1)}` },
        { label: 'BMI',            value: bmi > 0 ? bmi.toFixed(1) : '—' },
    ]);
    y += 2;
    y = barRow(y, 'Endomorphy   (fat-storage tendency)', endo, 7, [239, 68, 68]);
    y = barRow(y, 'Mesomorphy  (muscle-building tendency)', meso, 7, [16, 185, 129]);
    y = barRow(y, 'Ectomorphy   (lean / fast-metabolism tendency)', ecto, 7, [59, 130, 246]);
    y += 4;

    const somaDesc = {
        Endomorph:  'Endomorphs have a naturally rounder, softer physique with a tendency to store fat easily and a slower metabolic rate. This body type excels at building strength due to larger muscle bellies, but requires careful attention to caloric intake and cardiovascular conditioning. The key strategy is combining compound resistance training with metabolic conditioning work.',
        Mesomorph:  'Mesomorphs possess a naturally athletic, muscular build with efficient nutrient partitioning. This is widely considered the most responsive body type for both building muscle and losing fat simultaneously. The body adapts quickly to training stimuli, making progressive overload and program variation essential for continued progress.',
        Ectomorph:  'Ectomorphs are characterised by a lean, linear frame with a fast metabolism that burns calories rapidly, making both fat gain and muscle gain challenging. The key advantage is staying lean naturally. The primary challenge is achieving a consistent caloric surplus. Heavy compound movements and minimal cardio form the core of an effective Ectomorph program.',
        Unknown:    'Complete a full body scan with measurements to receive a detailed somatotype classification and personalised analysis.',
    };
    y = infoBox(y,
        doc.splitTextToSize(somaDesc[bt] || somaDesc.Unknown, CW - 8),
        [236, 254, 255], [30, 41, 59]
    );

    // Training and nutrition implications
    const implications = {
        Endomorph:  { train: 'High-rep (12–15) compound movements · Short rest (30–45s) · HIIT 2-3×/week · Superset-friendly', nutrition: 'Moderate caloric deficit (300–500 kcal) · Low-GI carbs timed around workouts · 35% carbs / 35% protein / 30% fats' },
        Mesomorph:  { train: 'Progressive overload focus (8–12 reps) · Moderate rest (60–75s) · Vary program every 4–6 weeks · Track PRs', nutrition: 'Balanced maintenance or slight surplus · Carb-cycle on training days · 40% carbs / 30% protein / 30% fats' },
        Ectomorph:  { train: 'Heavy compound lifts (5–8 reps) · Long rest (90–120s) · Low volume, high intensity · Avoid cardio overload', nutrition: 'Significant caloric surplus (400–600 kcal) · High-carb, calorie-dense foods · 50% carbs / 25% protein / 25% fats' },
        Unknown:    { train: 'Balanced compound program · Moderate intensity · Track progress and adjust accordingly', nutrition: 'Maintenance calories to start · Balanced macros · 40% carbs / 30% protein / 30% fats' },
    };
    const imp = implications[bt] || implications.Unknown;
    y = kv(y, 'Training Implication', imp.train);
    y = kv(y, 'Nutrition Implication', imp.nutrition, true);
    y += 5;

    // ────────────────────────────────────────────────────────
    //  SECTION 3: BODY COMPOSITION & BMI
    // ────────────────────────────────────────────────────────
    y = secHead(y, '3.', 'Body Composition & BMI', [30, 41, 59]);
    const bmiRanges = [
        { range: '< 18.5', cat: 'Underweight', note: 'May indicate insufficient muscle or fat mass' },
        { range: '18.5–24.9', cat: 'Normal Weight', note: 'Optimal health range for most adults' },
        { range: '25.0–29.9', cat: 'Overweight', note: 'Increased risk of metabolic disorders' },
        { range: '≥ 30.0', cat: 'Obese', note: 'Significantly elevated health risk — prioritise fat loss' },
    ];
    y = kv(y, 'BMI Value', bmi > 0 ? bmi.toFixed(2) : '—');
    y = kv(y, 'BMI Category', bmiCat, true);
    y = kv(y, 'Ideal Weight Range (BMI 18.5–24.9)', hCm > 0 ? `${(18.5 * (hCm/100)**2).toFixed(1)} – ${(24.9 * (hCm/100)**2).toFixed(1)} kg` : '—');
    y = kv(y, 'Weight vs Ideal', (wKg > 0 && hCm > 0) ? (() => { const mid = 21.7 * (hCm/100)**2; const diff = wKg - mid; return `${diff > 0 ? '+' : ''}${diff.toFixed(1)} kg vs midpoint (${mid.toFixed(1)} kg)`; })() : '—', true);
    y = kv(y, 'Endomorphy Score', `${endo.toFixed(2)} / 7.0 — Fat-storage tendency`);
    y = kv(y, 'Mesomorphy Score', `${meso.toFixed(2)} / 7.0 — Muscle mass tendency`, true);
    y = kv(y, 'Ectomorphy Score', `${ecto.toFixed(2)} / 7.0 — Lean/linear tendency`);
    y = kv(y, 'Estimated Muscle Score', `${Math.min(99, Math.round(meso * 13.3))} / 100`, true);
    y += 5;

    // ────────────────────────────────────────────────────────
    //  SECTION 4: BODY SHAPE CLASSIFICATION
    // ────────────────────────────────────────────────────────
    if (sh > 0 && wa > 0 && hi > 0) {
        y = secHead(y, '4.', 'Body Shape Classification');
        y = grid4(y, [
            { label: 'Body Shape',         value: bodyShape },
            { label: 'Shoulder / Hip',     value: shr.toFixed(3) },
            { label: 'Waist / Hip',        value: whr.toFixed(3) },
            { label: 'Shoulder / Waist',   value: stw.toFixed(3) },
        ]);
        const shapeDesc = {
            'Inv. Triangle': 'Broad shoulders with a narrow waist — the classic V-taper. Ideal for aesthetics and upper-body dominant sports. Focus on balancing lower-body development.',
            Triangle:        'Hips wider than shoulders — lower-body dominant. Prioritise upper-body compound movements (bench, overhead press, rows) to create visual balance.',
            Rectangle:       'Shoulders, waist, and hips are relatively equal in width. A well-balanced, versatile shape. Benefits from waist-defining exercises like oblique work and hip-hinging.',
            Oval:            'Midsection is the widest area. Core strengthening, cardiovascular conditioning, and waist reduction are the primary training priorities.',
            Trapezoid:       'Shoulders slightly wider than hips with a defined waist. One of the most athletically-favoured shapes. Maintain balance with full-body compound programming.',
            Unknown:         'Body shape could not be calculated — ensure shoulder, waist, and hip measurements are available in your scan.',
        };
        y = infoBox(y, doc.splitTextToSize(shapeDesc[bodyShape] || '', CW - 8));
        if (ch > 0) y = kv(y, 'Chest / Waist Ratio', ctw.toFixed(3));
        y += 5;
    } else {
        y = secHead(y, '4.', 'Body Shape Classification');
        y = infoBox(y, ['Insufficient measurement data. Complete a full HMR scan to classify body shape.'], [254, 242, 242], [185, 28, 28]);
        y += 5;
    }

    // ────────────────────────────────────────────────────────
    //  SECTION 5: BODY CIRCUMFERENCES
    // ────────────────────────────────────────────────────────
    if (Object.keys(m_cm).length > 0) {
        y = secHead(y, '5.', 'Body Circumferences — All Measurements', [30, 41, 59]);

        // Note about estimated fields
        if (estFields.length > 0) {
            y = infoBox(y,
                [`Note: Fields marked [Est.] are calculated from anthropometric formulas using your existing measurements and height.`,
                 `Estimated: ${estFields.map(f => f.charAt(0).toUpperCase() + f.slice(1)).join(', ')}`],
                [255, 251, 235], [120, 80, 0]
            );
        }

        const measOrder = [
            // Trunk
            ['chest',               'Chest (Pectoral Girth)'],
            ['bust',                'Bust / Chest'],
            ['waist',               'Waist'],
            ['waist_natural',       'Waist Natural'],
            ['waist_max',           'Waist Max'],
            ['hip',                 'Hip (Gluteal Girth)'],
            ['hips',                'Hips'],
            ['hips_max',            'Hips Max'],
            ['belly',               'Belly / Abdomen'],
            // Shoulders & arms
            ['shoulder',            'Shoulder Width'],
            ['shoulder_circumference','Shoulder Circumference'],
            ['overarm',             'Overarm (Deltoid)'],
            ['armscye',             'Armscye'],
            ['upper_arm',           'Upper Arm / Bicep'],
            ['forearm',             'Forearm'],
            ['wrist',               'Wrist'],
            // Neck
            ['neck',                'Neck'],
            // Legs
            ['thigh',               'Thigh'],
            ['knee_upper',          'Knee Upper (2″ above)'],
            ['knee',                'Knee'],
            ['calf',                'Calf'],
            ['ankle',               'Ankle'],
            // Other
            ['inseam',              'Inseam (Leg Length)'],
            ['head',                'Head Circumference'],
        ];
        let alt = false;
        measOrder.forEach(([key, label]) => {
            if (m_cm[key]) {
                const tag = estFields.includes(key) ? ' [Est.]' : '';
                y = kv(y, label + tag, `${m_cm[key].toFixed(1)} cm`, alt);
                alt = !alt;
            }
        });
        y += 5;
    }

    // ────────────────────────────────────────────────────────
    //  SECTION 6: LIMB LENGTHS & PROPORTIONS
    // ────────────────────────────────────────────────────────
    if (Object.keys(j_cm).length > 0) {
        y = secHead(y, '6.', 'Limb Lengths & Skeletal Proportions (MediaPipe)');
        const limbPairs = [
            [['left_upper_arm',  'L Upper Arm'],    ['right_upper_arm',  'R Upper Arm']],
            [['left_forearm',    'L Forearm'],       ['right_forearm',    'R Forearm']],
            [['left_arm_total',  'L Arm Total'],     ['right_arm_total',  'R Arm Total']],
            [['left_thigh',      'L Thigh'],         ['right_thigh',      'R Thigh']],
            [['left_shin',       'L Shin'],          ['right_shin',       'R Shin']],
            [['left_inseam',     'L Inseam'],        ['right_inseam',     'R Inseam']],
            [['left_foot',       'L Foot Length'],   ['right_foot',       'R Foot Length']],
            [['left_torso',      'L Torso'],         ['right_torso',      'R Torso']],
            [['shoulder_width',  'Shoulder Width'],  ['hip_width',        'Hip Width']],
            [['head_width',      'Head Width'],      ['arm_span',         'Arm Span']],
            [['left_hand_width', 'L Hand Width'],    ['right_hand_width', 'R Hand Width']],
            [['left_hand_span',  'L Hand Span'],     ['right_hand_span',  'R Hand Span']],
            [['spine_length',    'Spine Length'],    ['neck_height',      'Neck Height']],
            [['upper_body',      'Upper Body'],      ['crotch_height',    'Crotch Height']],
        ];
        let alt = false;
        limbPairs.forEach(([a, b]) => {
            const aVal = j_cm[a[0]], bVal = j_cm[b[0]];
            if (aVal || bVal) {
                y = kv(y, a[1], aVal ? aVal.toFixed(1) + ' cm' : '—', alt);
                alt = !alt;
                y = kv(y, b[1], bVal ? bVal.toFixed(1) + ' cm' : '—', alt);
                alt = !alt;
            }
        });
        y += 5;
    }

    // ────────────────────────────────────────────────────────
    //  SECTION 7: BODY RATIOS & INDICES
    // ────────────────────────────────────────────────────────
    y = secHead(y, '7.', 'Body Ratios & Anthropometric Indices', [30, 41, 59]);

    // 7a — HMR model ratios
    if (Object.keys(hmrRatios).length > 0) {
        y = subHead(y, 'HMR Model Ratios');
        const ratioMeta = {
            WHtR:  { label: 'Waist-to-Height Ratio (WHtR)', healthy: '< 0.50 (optimal health risk marker)' },
            WHR:   { label: 'Waist-to-Hip Ratio (WHR)',     healthy: '< 0.90 male / < 0.85 female (cardiovascular risk)' },
            SHR:   { label: 'Shoulder-to-Height Ratio',     healthy: '~0.25–0.30 (athletic range)' },
            HWR:   { label: 'Height-to-Weight Ratio',       healthy: 'Context-dependent' },
            LL_H:  { label: 'Leg Length-to-Height Ratio',   healthy: '~0.47–0.50 (leg dominance)' },
            TVR:   { label: 'Torso Volume Ratio',           healthy: 'Lower = leaner torso' },
            UAG_H: { label: 'Upper Arm-to-Height Ratio',    healthy: '~0.16–0.19 (arm development)' },
            TG_H:  { label: 'Thigh-to-Height Ratio',        healthy: '~0.27–0.33 (leg mass)' },
        };
        let alt = false;
        Object.entries(ratioMeta).forEach(([key, meta]) => {
            if (hmrRatios[key] != null) {
                y = kv(y, `${meta.label}  (${meta.healthy})`, Number(hmrRatios[key]).toFixed(4), alt);
                alt = !alt;
            }
        });
        y += 4;
    }

    // 7b — Derived health indices
    if (Object.keys(derivedRatios).length > 0) {
        y = subHead(y, 'Derived Health Indices');
        const derivedMeta = {
            ABSI:                    { label: 'A Body Shape Index (ABSI)',         healthy: 'Lower = less central adiposity risk' },
            BRI:                     { label: 'Body Roundness Index (BRI)',        healthy: '1–3 lean / 3–6 average / 6+ obese' },
            BSA_m2:                  { label: 'Body Surface Area (m²)',            healthy: '1.5–2.0 m² typical adult range' },
            lean_body_mass_kg:       { label: 'Lean Body Mass (kg)',               healthy: 'Higher = more muscle mass' },
            body_fat_pct_estimated:  { label: 'Body Fat % (estimated)',            healthy: '10–20% male / 18–28% female (fitness)' },
            WHtR:                    { label: 'Waist-to-Height Ratio (WHtR)',      healthy: '< 0.50 ideal' },
            waist_hip_ratio:         { label: 'Waist-to-Hip Ratio',               healthy: '< 0.90 male / < 0.85 female' },
            chest_waist_ratio:       { label: 'Chest-to-Waist Ratio',             healthy: '> 1.20 athletic' },
            shoulder_waist_ratio:    { label: 'Shoulder-to-Waist Ratio',          healthy: '> 1.40 V-taper goal' },
            calf_thigh_ratio:        { label: 'Calf-to-Thigh Ratio',              healthy: '~0.60–0.70 balanced' },
            arm_height_ratio:        { label: 'Arm-to-Height Ratio',              healthy: '~0.44–0.47 proportional' },
            cormic_index:            { label: 'Cormic Index (trunk/height)',       healthy: '~0.50–0.52 average' },
        };
        let alt = false;
        Object.entries(derivedMeta).forEach(([key, meta]) => {
            const val = derivedRatios[key];
            if (val != null) {
                const disp = typeof val === 'number' ? val.toFixed(4) : String(val);
                y = kv(y, `${meta.label}  (${meta.healthy})`, disp, alt);
                alt = !alt;
            }
        });
        y += 4;
    }

    // 7c — Skeletal ratios
    if (Object.keys(skeletalRatios).length > 0) {
        y = subHead(y, 'Skeletal Proportions & Ratios');
        const skelMeta = {
            SHR:  { label: 'Shoulder-to-Hip Ratio (SHR)',       healthy: '> 1.0 broad shoulders' },
            HWR:  { label: 'Height-to-Wrist Ratio (HWR)',       healthy: '> 10.4 small frame / < 9.6 large frame' },
            UAG_H:{ label: 'Upper Arm-to-Height (UAG_H)',       healthy: '~0.16–0.19' },
            TG_H: { label: 'Thigh Girth-to-Height (TG_H)',      healthy: '~0.27–0.33' },
            LL_H: { label: 'Leg Length-to-Height (LL_H)',       healthy: '~0.47–0.50' },
            FL_H: { label: 'Forearm-to-Height (FL_H)',          healthy: '~0.14–0.17' },
            AT_H: { label: 'Ankle-to-Height (AT_H)',            healthy: '~0.12–0.15' },
            CI:   { label: 'Cormic Index (CI)',                  healthy: '~0.50–0.52' },
            ASR:  { label: 'Arm Span Ratio (ASR)',              healthy: '~1.00–1.04' },
            ULR:  { label: 'Upper-Lower Limb Ratio (ULR)',      healthy: '~0.85–0.95' },
            LBR:  { label: 'Limb-to-Body Ratio (LBR)',          healthy: 'Sport-specific' },
            TLR:  { label: 'Trunk-to-Limb Ratio (TLR)',         healthy: '~0.50–0.55' },
            HSR:  { label: 'Head-to-Shoulder Ratio (HSR)',      healthy: '~0.25–0.30' },
            AII:  { label: 'Athleticism Index (AII)',           healthy: 'Higher = more athletic frame' },
        };
        let alt = false;
        Object.entries(skelMeta).forEach(([key, meta]) => {
            const val = skeletalRatios[key];
            if (val != null) {
                y = kv(y, `${meta.label}  (${meta.healthy})`, Number(val).toFixed(4), alt);
                alt = !alt;
            }
        });
        y += 5;
    }

    // ────────────────────────────────────────────────────────
    //  SECTION 8: SYMMETRY ANALYSIS
    // ────────────────────────────────────────────────────────
    if (Object.keys(symScores).length > 0) {
        y = secHead(y, '8.', 'Body Symmetry Analysis');
        y = infoBox(y,
            ['Symmetry is measured as the ratio of left-to-right limb lengths from MediaPipe pose landmarks.',
             '≥ 95%: Balanced   |   90–94%: Slight Imbalance   |   < 90%: Significant Imbalance'],
            [236, 254, 255], [30, 41, 59]
        );
        Object.entries(symScores).forEach(([sName, info]) => {
            if (typeof info === 'object' && info.ratio != null) {
                y = symBar(y, sName, info.ratio, info.assessment || '');
            }
        });
        y += 5;
    }

    // Body Proportions
    if (Object.keys(proportions).length > 0) {
        y = subHead(y, 'Skeletal Proportions');
        let alt = false;
        Object.entries(proportions).forEach(([pname, val]) => {
            if (val != null) {
                y = kv(y, pname, typeof val === 'number' ? val.toFixed(3) : val, alt);
                alt = !alt;
            }
        });
        y += 5;
    }

    // ────────────────────────────────────────────────────────
    //  SECTION 8b: JOINT & STRUCTURAL ANGLES
    // ────────────────────────────────────────────────────────
    const hasJointAngles  = Object.keys(jointAngles).length > 0;
    const hasStructAngles = Object.keys(structAngles).length > 0;
    if (hasJointAngles || hasStructAngles) {
        y = secHead(y, '8b.', 'Joint & Structural Angles (MediaPipe)', [30, 41, 59]);

        const JOINT_ANGLE_META = {
            left_knee_angle:       { label: 'Knee Flexion',          side: 'L', healthy: '~170–180° standing' },
            right_knee_angle:      { label: 'Knee Flexion',          side: 'R', healthy: '~170–180° standing' },
            left_hip_angle:        { label: 'Hip Flexion',           side: 'L', healthy: '~170–180° standing' },
            right_hip_angle:       { label: 'Hip Flexion',           side: 'R', healthy: '~170–180° standing' },
            left_elbow_angle:      { label: 'Elbow Flexion',         side: 'L', healthy: '~160–180° relaxed' },
            right_elbow_angle:     { label: 'Elbow Flexion',         side: 'R', healthy: '~160–180° relaxed' },
            left_shoulder_angle:   { label: 'Shoulder Abduction',    side: 'L', healthy: 'ROM-dependent' },
            right_shoulder_angle:  { label: 'Shoulder Abduction',    side: 'R', healthy: 'ROM-dependent' },
            left_ankle_angle:      { label: 'Ankle Dorsiflexion',    side: 'L', healthy: '~80–90° neutral' },
            right_ankle_angle:     { label: 'Ankle Dorsiflexion',    side: 'R', healthy: '~80–90° neutral' },
            left_q_angle:          { label: 'Q-Angle (knee valgus)', side: 'L', healthy: '< 15° male / < 20° female' },
            right_q_angle:         { label: 'Q-Angle (knee valgus)', side: 'R', healthy: '< 15° male / < 20° female' },
            left_wrist_angle:      { label: 'Wrist Flexion',         side: 'L', healthy: '~165–180° neutral' },
            right_wrist_angle:     { label: 'Wrist Flexion',         side: 'R', healthy: '~165–180° neutral' },
            left_neck_angle:       { label: 'Neck-Torso Angle',      side: 'L', healthy: '~150–170° upright posture' },
            right_neck_angle:      { label: 'Neck-Torso Angle',      side: 'R', healthy: '~150–170° upright posture' },
            left_foot_arch_angle:  { label: 'Foot Arch',             side: 'L', healthy: '~120–150° normal arch' },
            right_foot_arch_angle: { label: 'Foot Arch',             side: 'R', healthy: '~120–150° normal arch' },
        };

        if (hasJointAngles) {
            y = subHead(y, 'Joint Angles');
            let alt = false;
            Object.entries(jointAngles).forEach(([key, val]) => {
                const meta = JOINT_ANGLE_META[key] || { label: key.replace(/_/g,' '), side: '—', healthy: '—' };
                y = kv(y, `${meta.label} (${meta.side})  —  ${meta.healthy}`, `${Number(val).toFixed(1)}°`, alt);
                alt = !alt;
            });
            y += 4;
        }

        if (hasStructAngles) {
            y = subHead(y, 'Structural / Alignment Angles');
            const STRUCT_META = {
                shoulder_tilt_deg: { label: 'Shoulder Tilt',      healthy: '< ±3° level',       assess: v => Math.abs(v) < 3  ? 'Good' : 'Uneven' },
                hip_tilt_deg:      { label: 'Hip Tilt',           healthy: '< ±3° level',        assess: v => Math.abs(v) < 3  ? 'Good' : 'Uneven' },
                trunk_lean_deg:    { label: 'Trunk Lean',         healthy: '< ±5° upright',      assess: v => Math.abs(v) < 5  ? 'Good' : 'Leaning' },
                head_tilt_deg:     { label: 'Head Tilt',          healthy: '< ±5° level',        assess: v => Math.abs(v) < 5  ? 'Good' : 'Tilted' },
                forward_head_deg:  { label: 'Forward Head Posture', healthy: '< 10° ideal / > 20° FHP risk', assess: v => v < 10 ? 'Good' : v < 20 ? 'Mild FHP' : 'FHP Risk' },
            };
            let alt = false;
            Object.entries(structAngles).forEach(([key, val]) => {
                const meta = STRUCT_META[key] || { label: key.replace(/_/g,' '), healthy: '—', assess: () => '—' };
                const note = meta.assess(Number(val));
                y = kv(y, `${meta.label}  —  ${meta.healthy}`, `${Number(val).toFixed(1)}°  (${note})`, alt);
                alt = !alt;
            });
            y += 5;
        }
    }

    // ────────────────────────────────────────────────────────
    //  SECTION 9: TRAINING RECOMMENDATIONS
    // ────────────────────────────────────────────────────────
    doc.addPage(); y = M + 4;
    y = secHead(y, '9.', 'Personalised Training Recommendations');

    const trainingProto = {
        Endomorph: {
            overview: 'Your Endomorph physiology responds best to high-frequency training with metabolic stress. The combination of compound movements with short rest periods creates an anabolic environment while keeping calories burning post-workout (EPOC effect).',
            split: '4-day Upper/Lower or Push-Pull split. Full-body circuits on conditioning days.',
            reps: '12–15 reps per set with 30–45 second rest periods.',
            cardio: 'HIIT cardio 2–3× per week (20 min sessions). LISS walking (8,000–10,000 steps/day).',
            priority: 'Chest, Back, Legs — large muscle groups burn the most calories.',
            avoid: 'Avoid excessive isolation work and very long rest periods. Keep sessions under 60 min.',
            progressive: 'Track rest periods, not just weight. Reducing rest time is your primary progressive overload tool.',
        },
        Mesomorph: {
            overview: 'Your Mesomorph physiology is the most adaptive — you gain muscle and lose fat more efficiently than any other body type. The risk is complacency; Mesomorphs plateau quickly if training is not progressively varied.',
            split: '4–5 day Push/Pull/Legs or Upper/Lower split.',
            reps: '8–12 reps per set (hypertrophy range) with 60–75 second rest periods.',
            cardio: 'Moderate cardio 2× per week. Not required for fat loss at maintenance calories.',
            priority: 'All muscle groups respond equally well — prioritise weakest areas.',
            avoid: 'Avoid training the same muscle group 2 days in a row. Vary rep ranges every 4–6 weeks.',
            progressive: 'Add 2.5–5 kg or 1–2 reps per week on key compound lifts. Track PRs.',
        },
        Ectomorph: {
            overview: 'Your Ectomorph physiology requires a fundamentally different approach to most training plans. Volume should be lower than average, intensity should be high, and recovery time is critical. Your fast metabolism means calories disappear faster — eating is just as important as training.',
            split: '3–4 day Full-Body or Upper/Lower split. Avoid daily training.',
            reps: '5–8 reps per set (strength/mass range) with 90–120 second rest periods.',
            cardio: 'Limit cardio to 1–2 light sessions per week (20 min walk). Avoid all HIIT.',
            priority: 'Squats, Deadlifts, Bench Press, Overhead Press, Rows — the core five.',
            avoid: 'Avoid isolation exercises, excessive cardio, insufficient sleep, and skipping meals.',
            progressive: 'Focus on adding weight to compound lifts. Even small weekly increments (1.25 kg) compound significantly.',
        },
        Unknown: {
            overview: 'Complete a full body scan to receive personalised training recommendations based on your somatotype.',
            split: 'Start with a 3-day full-body programme.', reps: '10–12 reps, 60s rest.',
            cardio: 'Moderate cardio 2× per week.', priority: 'All major muscle groups equally.',
            avoid: 'Skipping sessions.', progressive: 'Add weight or reps each week.',
        },
    };
    const tp9 = trainingProto[bt] || trainingProto.Unknown;
    y = wrapText(y, tp9.overview, 0, 8.5, [30, 41, 59]); y += 3;
    y = kv(y, 'Recommended Split', tp9.split);
    y = kv(y, 'Rep & Rest Scheme', tp9.reps, true);
    y = kv(y, 'Cardio Prescription', tp9.cardio);
    y = kv(y, 'Priority Muscle Groups', tp9.priority, true);
    y = kv(y, 'Progressive Overload Strategy', tp9.progressive);
    y = kv(y, 'Common Mistakes to Avoid', tp9.avoid, true);

    // Target muscles from scan
    const targetMuscles = (typeof TARGET_MUSCLES !== 'undefined' && TARGET_MUSCLES.length > 0) ? TARGET_MUSCLES : [];
    if (targetMuscles.length > 0) {
        y += 3;
        y = subHead(y, 'Scan-Identified Target Muscles');
        y = bulletList(y, targetMuscles.map(m => m.charAt(0).toUpperCase() + m.slice(1) + ' — prioritise in your weekly programme'));
    }
    y += 5;

    // ────────────────────────────────────────────────────────
    //  SECTION 10: WEEKLY EXERCISE PLAN
    // ────────────────────────────────────────────────────────
    const exWeekly = exPlan ? (exPlan.weekly_plan || exPlan.plan?.weekly_plan || null) : null;
    const exNotes  = exPlan ? (exPlan.weekly_notes || exPlan.plan?.weekly_notes || '') : '';

    y = secHead(y, '10.', 'Weekly Exercise Plan', [30, 41, 59]);
    if (!exWeekly) {
        y = infoBox(y, ['No exercise plan generated yet. Visit the Exercise page and click "Generate Plan" to create your personalised workout programme.'], [254, 242, 242], [185, 28, 28]);
    } else {
        const exSummary = exPlan.plan_summary || exPlan.plan?.plan_summary || '';
        if (exSummary) { y = wrapText(y, exSummary, 0, 8, [71, 85, 105]); y += 2; }
        if (exNotes)   { y = wrapText(y, exNotes,   0, 8, [100, 116, 139]); y += 4; }

        exWeekly.forEach(day => {
            y = chk(y, 20);
            // Day header
            doc.setFillColor(30, 41, 59); doc.rect(M, y - 2, CW, 10, 'F');
            doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
            doc.text(`${day.day}  —  ${day.focus || ''}`, M + 3, y + 5);
            if (!day.is_rest_day && day.estimated_duration_min) {
                doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
                doc.text(`~${day.estimated_duration_min} min  |  ${(day.exercises||[]).length} exercises`, pageW - M - 3, y + 5, { align: 'right' });
            }
            y += 13;

            if (day.is_rest_day) {
                doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'italic'); doc.setFontSize(8);
                const rt = doc.splitTextToSize('🛌  ' + (day.warmup || 'Rest & active recovery.'), CW - 4);
                doc.text(rt, M + 3, y); y += rt.length * 5 + 5; return;
            }

            // Warmup
            if (day.warmup) {
                doc.setTextColor(16, 185, 129); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
                doc.text('WARMUP:', M, y);
                doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
                const wl = doc.splitTextToSize(day.warmup, CW - 22);
                doc.text(wl, M + 20, y); y += Math.max(wl.length * 4.5, 5) + 3;
            }

            // Exercise table header
            doc.setFillColor(236, 254, 255); doc.rect(M, y, CW, 7, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(6, 182, 212);
            doc.text('#', M + 2, y + 4.8);
            doc.text('Exercise Name', M + 8, y + 4.8);
            doc.text('Muscle Groups', M + 82, y + 4.8);
            doc.text('Sets × Reps', M + 127, y + 4.8);
            doc.text('Rest', M + 152, y + 4.8);
            doc.text('★', M + 167, y + 4.8);
            y += 9;

            (day.exercises || []).forEach((ex, ei) => {
                y = chk(y, ex.tips ? 18 : 8);
                const rowH = 7.5;
                doc.setFillColor(ei % 2 === 0 ? 255 : 248, ei % 2 === 0 ? 255 : 250, ei % 2 === 0 ? 255 : 252);
                doc.rect(M, y, CW, rowH, 'F');
                doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
                doc.text(`${ei + 1}`, M + 2, y + 5);
                // Truncate name to fit
                const exName = ex.name && ex.name.length > 28 ? ex.name.slice(0, 26) + '..' : (ex.name || '');
                doc.setFont('helvetica', 'bold');
                doc.text(exName, M + 8, y + 5);
                doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
                const muscles = (ex.muscle_groups || []).slice(0, 2).join(', ');
                doc.setTextColor(100, 116, 139);
                doc.text(muscles, M + 82, y + 5);
                doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
                doc.text(`${ex.sets || 3}×${ex.reps || 10}`, M + 127, y + 5);
                doc.setFont('helvetica', 'normal');
                doc.text(`${ex.rest_seconds || 60}s`, M + 152, y + 5);
                const bC = ex.benefit_rating === 'high' ? [16,185,129] : ex.benefit_rating === 'medium' ? [245,158,11] : [59,130,246];
                doc.setTextColor(...bC); doc.setFont('helvetica', 'bold');
                doc.text(ex.benefit_rating === 'high' ? '★' : ex.benefit_rating === 'medium' ? '◆' : '●', M + 167, y + 5);
                y += rowH;

                // Show tip if present
                if (ex.tips) {
                    y = chk(y, 8);
                    doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
                    const tipLines = doc.splitTextToSize(`   💡 ${ex.tips}`, CW - 10);
                    doc.text(tipLines, M + 6, y + 3);
                    y += tipLines.length * 3.8 + 2;
                }
            });

            if (day.cooldown) {
                y += 1;
                doc.setTextColor(59, 130, 246); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
                doc.text('COOLDOWN:', M, y);
                doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
                const cl = doc.splitTextToSize(day.cooldown, CW - 24);
                doc.text(cl, M + 22, y); y += Math.max(cl.length * 4.5, 5) + 3;
            }
            y += 6;
        });
    }

    // ────────────────────────────────────────────────────────
    //  SECTION 11: NUTRITION & CALORIE ANALYSIS
    // ────────────────────────────────────────────────────────
    doc.addPage(); y = M + 4;
    y = secHead(y, '11.', 'Nutrition & Calorie Analysis');

    const macro = dietPlanData ? (dietPlanData.macro_split || dietPlanData.plan?.macro_split || {}) : {};
    const dailyCal = dietPlanData ? (dietPlanData.daily_calories || dietPlanData.plan?.daily_calories || 0) : 0;
    const goalStr  = goals.length ? goals[0].replace(/_/g, ' ') : 'general fitness';

    y = infoBox(y, [
        `Your nutrition plan is built for ${bt} body type targeting ${goalStr}.`,
        `Based on the Mifflin-St Jeor formula with your measurements and activity level.`,
    ], [236, 254, 255], [30, 41, 59]);

    y = grid4(y, [
        { label: 'BMR (Resting)',       value: Math.round(bmrVal) + ' kcal' },
        { label: 'TDEE (Active)',        value: Math.round(tdeeVal) + ' kcal' },
        { label: 'Target Calories',     value: (dailyCal || Math.round(tdeeVal + (bt === 'Ectomorph' ? 450 : bt === 'Endomorph' ? -400 : 0))) + ' kcal' },
        { label: 'Calorie Strategy',    value: bt === 'Ectomorph' ? 'Surplus +450' : bt === 'Endomorph' ? 'Deficit -400' : 'Maintenance' },
    ]);
    y += 3;

    if (macro.protein_g) {
        y = subHead(y, 'Daily Macro Targets');
        y = grid4(y, [
            { label: 'Protein', value: `${macro.protein_g}g (${macro.protein_pct}%)` },
            { label: 'Carbohydrates', value: `${macro.carbs_g}g (${macro.carbs_pct}%)` },
            { label: 'Fats', value: `${macro.fats_g}g (${macro.fats_pct}%)` },
            { label: 'Protein / kg BW', value: macro.protein_per_kg ? macro.protein_per_kg + 'g/kg' : `${((macro.protein_g||0)/wKg).toFixed(2)}g/kg` },
        ], true);
        y += 3;
    } else {
        // Calculate fallback macros
        const macroRatios = { Endomorph:{c:35,p:35,f:30}, Mesomorph:{c:40,p:30,f:30}, Ectomorph:{c:50,p:25,f:25}, Unknown:{c:40,p:30,f:30} };
        const mr = macroRatios[bt] || macroRatios.Unknown;
        const tc = Math.round(tdeeVal + (bt === 'Ectomorph' ? 450 : bt === 'Endomorph' ? -400 : 0));
        y = subHead(y, 'Estimated Daily Macro Targets');
        y = grid4(y, [
            { label: 'Protein',       value: `${Math.round(tc * mr.p / 100 / 4)}g (${mr.p}%)` },
            { label: 'Carbohydrates', value: `${Math.round(tc * mr.c / 100 / 4)}g (${mr.c}%)` },
            { label: 'Fats',          value: `${Math.round(tc * mr.f / 100 / 9)}g (${mr.f}%)` },
            { label: 'Protein / kg',  value: `${(Math.round(tc * mr.p / 100 / 4) / wKg).toFixed(2)}g/kg` },
        ], true);
        y += 3;
    }

    // Nutrition guidelines
    y = subHead(y, 'Body-Type Specific Nutrition Guidelines');
    const nutriGuide = {
        Endomorph: [
            'Keep simple carbohydrates low — stick to oats, brown rice, sweet potato, and legumes.',
            'Time carbohydrates around training: consume the majority pre and post-workout.',
            'Prioritise lean protein sources: chicken breast, fish, egg whites, Greek yoghurt, legumes.',
            'Include healthy fats (avocado, olive oil, nuts) but moderate total intake.',
            'Drink 3–4 litres of water daily. Green tea (EGCG) supports fat oxidation.',
            'Meal timing matters — eat 4–5 smaller meals rather than 2–3 large ones.',
            'Avoid late-night eating; metabolic rate slows significantly after 9 PM.',
        ],
        Mesomorph: [
            'Carb-cycle: higher carb intake (~50%) on training days, lower (~30%) on rest days.',
            'Consume protein within 30 minutes post-workout for optimal muscle protein synthesis.',
            'Include pre-workout carbs (1–2 hours before) for sustained energy.',
            'Healthy fats from sources like salmon, walnuts, olive oil support hormonal function.',
            'Track macros at least 3 days per week to stay consistent.',
            'Meal prep Sunday helps maintain consistency through the week.',
        ],
        Ectomorph: [
            'Never skip meals — even one missed meal can cost significant muscle gains.',
            'Eat every 3 hours; set alarms if necessary.',
            'Add calorie-dense foods: nut butter, ghee, whole milk, dried fruit, avocado, granola.',
            'Liquid calories (smoothies, milk, protein shakes) are easier to consume in surplus.',
            'Post-workout window is critical — consume 50–70g carbs + 30–40g protein immediately.',
            'Focus on nutrient-dense whole foods, not junk. Quality surplus matters.',
        ],
        Unknown: [
            'Eat balanced whole foods across all macronutrient groups.',
            'Track calories for 2 weeks to understand your baseline intake.',
            'Prioritise protein at every meal (20–30g per meal).',
        ],
    };
    y = bulletList(y, nutriGuide[bt] || nutriGuide.Unknown);
    y += 5;

    // ────────────────────────────────────────────────────────
    //  SECTION 12: WEEKLY DIET CHART
    // ────────────────────────────────────────────────────────
    const dietDays = dietPlanData ? (dietPlanData.days || dietPlanData.plan?.days || null) : null;
    y = secHead(y, '12.', 'Weekly Diet Chart', [30, 41, 59]);

    if (!dietDays) {
        y = infoBox(y, ['No diet plan generated yet. Visit the Diet page and click "Generate Diet Plan" to create your personalised nutrition programme.'], [254, 242, 242], [185, 28, 28]);
    } else {
        dietDays.forEach(day => {
            y = chk(y, 20);
            doc.setFillColor(30, 41, 59); doc.rect(M, y - 2, CW, 10, 'F');
            doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
            doc.text(day.day, M + 3, y + 5);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
            doc.text(`${day.total_calories || 0} kcal  |  P: ${day.total_protein_g||0}g  C: ${day.total_carbs_g||0}g  F: ${day.total_fats_g||0}g`, pageW - M - 3, y + 5, { align: 'right' });
            y += 12;

            (day.meals || []).forEach((meal, mi) => {
                y = chk(y, 14);
                doc.setFillColor(mi % 2 === 0 ? 248 : 241, mi % 2 === 0 ? 250 : 247, mi % 2 === 0 ? 252 : 255);
                doc.rect(M, y, CW, 8, 'F');
                doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
                doc.text(meal.meal_name || '', M + 3, y + 5.5);
                if (meal.time) {
                    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
                    doc.text(meal.time, M + 65, y + 5.5);
                }
                doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(6, 182, 212);
                doc.text(`${meal.total_calories || 0} kcal`, pageW - M - 3, y + 5.5, { align: 'right' });
                y += 10;

                (meal.items || []).forEach((item, ii) => {
                    y = chk(y, 6);
                    doc.setFillColor(ii % 2 === 0 ? 255 : 252, 255, ii % 2 === 0 ? 255 : 252);
                    doc.rect(M + 3, y, CW - 3, 6, 'F');
                    doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
                    const fname = (item.food || '').length > 35 ? (item.food || '').slice(0, 33) + '..' : (item.food || '');
                    doc.text(fname, M + 6, y + 4.2);
                    doc.setTextColor(100, 116, 139);
                    doc.text(item.portion || '', M + 88, y + 4.2);
                    doc.text(`${item.calories || 0} cal`, M + 120, y + 4.2);
                    doc.text(`P:${(item.protein_g||0).toFixed(0)}  C:${(item.carbs_g||0).toFixed(0)}  F:${(item.fats_g||0).toFixed(0)}`, pageW - M - 3, y + 4.2, { align: 'right' });
                    y += 6;
                });
                y += 3;
            });
            y += 4;
        });

        // Grocery list
        const grocery = dietPlanData ? (dietPlanData.grocery_list || dietPlanData.plan?.grocery_list || null) : null;
        if (grocery && Object.keys(grocery).length > 0) {
            y = chk(y, 16);
            y = subHead(y, 'Weekly Grocery List');
            for (const [cat, items] of Object.entries(grocery)) {
                if (!items || items.length === 0) continue;
                y = chk(y, 12);
                const catLabel = cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(6, 182, 212);
                doc.text(catLabel + ':', M + 3, y + 4); y += 7;
                const cc = 3, cw = CW / cc;
                items.forEach((item, i) => {
                    y = chk(y, 6);
                    const col = i % cc;
                    if (col === 0 && i > 0) y += 5.5;
                    doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
                    doc.text(`• ${item}`, M + 3 + col * cw, y);
                    if (col === cc - 1 || i === items.length - 1) y += 5.5;
                });
                y += 4;
            }
        }
    }

    // ────────────────────────────────────────────────────────
    //  SECTION 13: RECOVERY & LIFESTYLE PROTOCOL
    // ────────────────────────────────────────────────────────
    doc.addPage(); y = M + 4;
    y = secHead(y, '13.', 'Recovery & Lifestyle Protocol');

    const recovProto = {
        Endomorph: {
            sleep: '7–8 hours per night. Consistent sleep/wake time regulates cortisol and prevents fat storage from stress hormones.',
            active: 'Active recovery on rest days: 20–30 min brisk walk (aim for 8,000–10,000 steps total), light stretching (20 min), foam rolling if available.',
            hydration: '3–4 litres of water daily. Green tea (2–3 cups) enhances fat oxidation via EGCG polyphenols.',
            stress: 'Chronic stress elevates cortisol, directly promoting abdominal fat storage. Prioritise stress management through yoga, meditation, or daily walking.',
            supplements: 'Creatine monohydrate (3–5g/day), Omega-3 (2–3g/day), Vitamin D (2000 IU/day), Whey Protein (if under protein targets), Green Tea Extract.',
        },
        Mesomorph: {
            sleep: '7–9 hours per night. Growth hormone is predominantly released during deep sleep — this is your most effective "supplement".',
            active: 'Active recovery on rest days: 15–20 min light cycling or swimming, dynamic mobility drills (10 min), targeted muscle stretching.',
            hydration: '2.5–3.5 litres of water daily. Electrolytes post-training if sweating heavily.',
            stress: 'Moderate stress tolerance. Ensure at least 2 full rest days per week. Overtraining is the primary risk for Mesomorphs who progress quickly.',
            supplements: 'Creatine monohydrate (5g/day), Omega-3 (2g/day), Vitamin D (1500 IU/day), Whey Protein (as needed to hit targets).',
        },
        Ectomorph: {
            sleep: '8–9 hours per night. Growth hormone is the primary driver of muscle synthesis for Ectomorphs. Insufficient sleep directly halts progress.',
            active: 'On rest days: 10–15 min gentle walk ONLY. Full static stretching session (30 min). Avoid any cardio — conserve calories for muscle building.',
            hydration: '2.5–3 litres of water daily. Avoid over-hydrating, which can suppress appetite.',
            stress: 'Cortisol is catabolic (muscle-destroying) — especially damaging for Ectomorphs. Manage stress actively. Avoid overtraining at all costs.',
            supplements: 'Creatine monohydrate (5g/day — most impactful for Ectomorphs), Mass gainer or Whey Protein, Omega-3 (2g/day), Vitamin D, Zinc (15mg/day).',
        },
        Unknown: {
            sleep: '7–9 hours per night consistently.',
            active: '20 min light activity on rest days.', hydration: '2.5–3 litres of water daily.',
            stress: 'Manage stress through regular exercise, adequate sleep, and mindfulness.',
            supplements: 'Whey Protein, Creatine, Omega-3, Vitamin D.',
        },
    };
    const rp = recovProto[bt] || recovProto.Unknown;
    y = kv(y, 'Sleep Protocol', rp.sleep);
    y = kv(y, 'Active Recovery', rp.active, true);
    y = kv(y, 'Hydration Target', rp.hydration);
    y = kv(y, 'Stress Management', rp.stress, true);
    y = kv(y, 'Supplement Stack (Optional)', rp.supplements);
    y += 6;

    // ────────────────────────────────────────────────────────
    //  SECTION 14: 30-DAY ACTION PLAN
    // ────────────────────────────────────────────────────────
    y = secHead(y, '14.', '30-Day Action Plan & Next Steps', [30, 41, 59]);

    const weeks = [
        {
            title: 'Week 1–2: Foundation',
            items: [
                'Follow the generated exercise plan for all training days — no skipping.',
                'Set up meal prep for the week using the diet chart above.',
                'Establish sleep schedule: same bedtime and wake-up time every day.',
                'Begin tracking daily steps (target: body-type goal from Section 9).',
                'Take progress photos on Day 1 and Day 14 for comparison.',
            ]
        },
        {
            title: 'Week 3–4: Intensification',
            items: [
                'Attempt progressive overload: add 2.5 kg or 1–2 reps to each key lift.',
                'Review nutrition adherence: were you hitting protein targets daily?',
                'Check symmetry: are both sides of compound movements feeling equal?',
                'Adjust calories if weight is not moving in the correct direction (+/- 150 kcal).',
                'Complete a new FitScan body scan to track measurable progress.',
            ]
        },
    ];

    weeks.forEach(week => {
        y = chk(y, 14);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(6, 182, 212);
        doc.text(week.title, M + 3, y + 5); y += 9;
        y = bulletList(y, week.items);
        y += 3;
    });

    // Key metrics to track
    y = subHead(y, 'Key Metrics to Track Fortnightly');
    y = bulletList(y, [
        'Body weight (morning, same day each week)',
        'Key lift weights: Squat, Bench Press, Deadlift, Overhead Press',
        'Body circumferences: Waist, Hip, Chest, Upper Arm, Thigh',
        'Progress photos (front, side, back)',
        'Energy levels and sleep quality (1–10 self-rating)',
    ]);
    y += 3;

    // Closing motivational note
    y = chk(y, 28);
    doc.setFillColor(...btCol);
    doc.rect(M, y, CW, 24, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(255, 255, 255);
    doc.text('Your journey starts now.', pageW / 2, y + 9, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    const closingText = `This report is your personalised blueprint. Every measurement, every exercise, every meal — all of it is calibrated specifically for your ${bt} body type and your goals. The science is here. Now bring the consistency.`;
    const closingLines = doc.splitTextToSize(closingText, CW - 12);
    doc.text(closingLines, pageW / 2, y + 16, { align: 'center' });
    y += 28;

    // ── Footers on every page ──────────────────────────────
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(6, 182, 212); doc.line(10, pageH - 10, pageW - 10, pageH - 10);
        doc.setTextColor(148, 163, 184); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.text('FitScan Complete Health & Fitness Report — Confidential', M, pageH - 5);
        doc.text(`Page ${i} of ${totalPages}`, pageW - M, pageH - 5, { align: 'right' });
    }

    doc.save(`FitScan_Full_Report_${scanDate}.pdf`);
}
