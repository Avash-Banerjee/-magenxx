/* ═══════════════════════════════════════
   FitScan — PDF Export (jsPDF)
   Exports exercise plan and diet plan as formatted PDFs.
   Loaded on exercise.html and diet.html pages.
   ═══════════════════════════════════════ */

// jsPDF is loaded from CDN in the templates that need it.

// ── Helpers ──────────────────────────────────────────
function pdfAddPageIfNeeded(doc, y, margin, pageH) {
    if (y + margin > pageH - 20) {
        doc.addPage();
        return margin;
    }
    return y;
}

function pdfHeader(doc, title, subtitle, bodyType, goal) {
    const pageW = doc.internal.pageSize.getWidth();

    // Background bar
    doc.setFillColor(6, 182, 212);
    doc.rect(0, 0, pageW, 36, 'F');

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('FitScan', 14, 14);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(title, 14, 23);

    // Right side
    doc.setFontSize(9);
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.text(today, pageW - 14, 14, { align: 'right' });
    if (bodyType) doc.text(`Body Type: ${bodyType}`, pageW - 14, 22, { align: 'right' });
    if (goal)     doc.text(`Goal: ${goal}`, pageW - 14, 30, { align: 'right' });

    // Subtitle
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    if (subtitle) doc.text(subtitle, 14, 44);

    return 50; // return Y after header
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

// ── EXERCISE PDF ──────────────────────────────────────
function exportExercisePDF() {
    if (!planData) {
        alert("No exercise plan loaded. Please generate a plan first.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;

    // Detect body type and goal from plan summary
    const bodyType = planData.weekly_plan?.[0] ? 'From Scan' : '';

    let y = pdfHeader(doc, 'Weekly Exercise Plan', planData.plan_summary || '', bodyType, '');

    // Weekly notes
    if (planData.weekly_notes) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        const notes = doc.splitTextToSize(planData.weekly_notes, pageW - 28);
        doc.text(notes, margin, y);
        y += notes.length * 4.5 + 6;
    }

    // Each day
    (planData.weekly_plan || []).forEach((day, di) => {
        y = pdfAddPageIfNeeded(doc, y, margin, pageH);

        // Day header
        doc.setFillColor(30, 41, 59);
        doc.rect(margin, y - 2, pageW - margin * 2, 10, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(`${day.day}  —  ${day.focus || ''}`, margin + 3, y + 5);
        if (!day.is_rest_day && day.estimated_duration_min) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.text(`~${day.estimated_duration_min} min`, pageW - margin - 3, y + 5, { align: 'right' });
        }
        y += 13;

        if (day.is_rest_day) {
            doc.setTextColor(100, 116, 139);
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8.5);
            const restTxt = doc.splitTextToSize(day.warmup || 'Rest and recover.', pageW - 28);
            doc.text(restTxt, margin, y);
            y += restTxt.length * 4.5 + 6;
            return;
        }

        // Warmup
        if (day.warmup) {
            doc.setTextColor(16, 185, 129);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.text('WARMUP:', margin, y);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(71, 85, 105);
            const wLines = doc.splitTextToSize(day.warmup, pageW - 42);
            doc.text(wLines, margin + 18, y);
            y += Math.max(wLines.length * 4, 5) + 4;
        }

        // Exercises table header
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, pageW - margin * 2, 7, 'F');
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text('#', margin + 2, y + 4.8);
        doc.text('Exercise', margin + 8, y + 4.8);
        doc.text('Sets × Reps', margin + 100, y + 4.8);
        doc.text('Rest', margin + 130, y + 4.8);
        doc.text('Impact', margin + 148, y + 4.8);
        y += 9;

        (day.exercises || []).forEach((ex, ei) => {
            y = pdfAddPageIfNeeded(doc, y, margin, pageH);
            const rowH = 7;
            const bg   = ei % 2 === 0 ? [255, 255, 255] : [248, 250, 252];
            doc.setFillColor(...bg);
            doc.rect(margin, y, pageW - margin * 2, rowH, 'F');

            doc.setTextColor(30, 41, 59);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.text(`${ei + 1}`, margin + 2, y + 4.8);
            doc.text(ex.name || '', margin + 8, y + 4.8);

            doc.setFont('helvetica', 'bold');
            doc.text(`${ex.sets}×${ex.reps}`, margin + 100, y + 4.8);

            doc.setFont('helvetica', 'normal');
            doc.text(`${ex.rest_seconds}s`, margin + 130, y + 4.8);

            // Benefit badge
            const bColor = ex.benefit_rating === 'high' ? [16, 185, 129]
                         : ex.benefit_rating === 'medium' ? [245, 158, 11]
                         : [59, 130, 246];
            doc.setTextColor(...bColor);
            doc.setFont('helvetica', 'bold');
            doc.text(ex.benefit_rating === 'high' ? '★ HIGH'
                   : ex.benefit_rating === 'medium' ? '◆ MED' : '● LOW',
                   margin + 148, y + 4.8);

            y += rowH;
        });

        // Cooldown
        if (day.cooldown) {
            y += 2;
            doc.setTextColor(59, 130, 246);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.text('COOLDOWN:', margin, y);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(71, 85, 105);
            const cLines = doc.splitTextToSize(day.cooldown, pageW - 44);
            doc.text(cLines, margin + 22, y);
            y += Math.max(cLines.length * 4, 5) + 4;
        }

        y += 5;
    });

    // Footer on all pages
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(6, 182, 212);
        doc.line(10, pageH - 10, pageW - 10, pageH - 10);
        doc.setTextColor(148, 163, 184);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text('Generated by FitScan — fitscan.app', margin, pageH - 5);
        doc.text(`Page ${i} of ${totalPages}`, pageW - margin, pageH - 5, { align: 'right' });
    }

    doc.save('FitScan_Exercise_Plan.pdf');

    // Show PDF button after first save
    const pdfBtn = document.getElementById('btnPdfExport');
    if (pdfBtn) pdfBtn.style.display = 'inline-flex';
}


// ── DIET PDF ──────────────────────────────────────────
function exportDietPDF() {
    if (!dietPlan) {
        alert("No diet plan loaded. Please generate a plan first.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;

    const macro = dietPlan.macro_split || {};

    let y = pdfHeader(doc, 'Weekly Diet Plan',
        `${dietPlan.daily_calories || 0} kcal/day — ${macro.protein_g || 0}g Protein · ${macro.carbs_g || 0}g Carbs · ${macro.fats_g || 0}g Fats`,
        '', '');

    // Plan summary
    if (dietPlan.plan_summary) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        const sLines = doc.splitTextToSize(dietPlan.plan_summary, pageW - 28);
        doc.text(sLines, margin, y);
        y += sLines.length * 4.5 + 6;
    }

    // Macro summary box
    doc.setFillColor(236, 254, 255);
    doc.rect(margin, y, pageW - margin * 2, 18, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(6, 182, 212);
    doc.text('DAILY TARGETS', margin + 4, y + 7);
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    const cols = [
        `Calories: ${dietPlan.daily_calories || 0} kcal`,
        `Protein: ${macro.protein_g || 0}g (${macro.protein_pct || 0}%)`,
        `Carbs: ${macro.carbs_g || 0}g (${macro.carbs_pct || 0}%)`,
        `Fats: ${macro.fats_g || 0}g (${macro.fats_pct || 0}%)`,
    ];
    const colW = (pageW - margin * 2 - 8) / cols.length;
    cols.forEach((text, i) => {
        doc.text(text, margin + 4 + i * colW, y + 15);
    });
    y += 24;

    // Each day
    (dietPlan.days || []).forEach((day, di) => {
        y = pdfAddPageIfNeeded(doc, y, margin, pageH);

        // Day header
        doc.setFillColor(30, 41, 59);
        doc.rect(margin, y - 2, pageW - margin * 2, 10, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(`${day.day}`, margin + 3, y + 5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(`${day.total_calories || 0} kcal`, pageW - margin - 3, y + 5, { align: 'right' });
        y += 13;

        (day.meals || []).forEach((meal, mi) => {
            y = pdfAddPageIfNeeded(doc, y, margin, pageH);

            // Meal header
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, y, pageW - margin * 2, 8, 'F');
            doc.setTextColor(30, 41, 59);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.text(`${meal.meal_name}`, margin + 3, y + 5.5);
            if (meal.time) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.5);
                doc.setTextColor(100, 116, 139);
                doc.text(meal.time, margin + 60, y + 5.5);
            }
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(6, 182, 212);
            doc.text(`${meal.total_calories || 0} kcal`, pageW - margin - 3, y + 5.5, { align: 'right' });
            y += 10;

            // Items
            (meal.items || []).forEach((item, ii) => {
                y = pdfAddPageIfNeeded(doc, y, margin, pageH);
                const rowH = 6;
                doc.setFillColor(ii % 2 === 0 ? 255 : 250, ii % 2 === 0 ? 255 : 250, ii % 2 === 0 ? 255 : 252);
                doc.rect(margin + 4, y, pageW - margin * 2 - 4, rowH, 'F');

                doc.setTextColor(30, 41, 59);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.5);
                doc.text(item.food || '', margin + 7, y + 4.2);

                doc.setTextColor(100, 116, 139);
                doc.text(item.portion || '', margin + 85, y + 4.2);
                doc.text(`${item.calories || 0} cal`, margin + 120, y + 4.2);
                doc.text(`P:${(item.protein_g||0).toFixed(0)}g  C:${(item.carbs_g||0).toFixed(0)}g  F:${(item.fats_g||0).toFixed(0)}g`,
                    pageW - margin - 3, y + 4.2, { align: 'right' });
                y += rowH;
            });
            y += 4;
        });
        y += 4;
    });

    // Grocery list
    if (dietPlan.grocery_list && Object.keys(dietPlan.grocery_list).length > 0) {
        doc.addPage();
        let y = pdfHeader(doc, 'Weekly Grocery List', 'Everything you need for the week', '', '');

        const grocery = dietPlan.grocery_list;
        const icons = { proteins:'🥩', grains:'🌾', vegetables:'🥬', fruits:'🍎', dairy:'🥛', fats_and_nuts:'🥜', others:'🧂' };

        for (const [cat, items] of Object.entries(grocery)) {
            if (!items || items.length === 0) continue;
            y = pdfAddPageIfNeeded(doc, y, margin, pageH);

            const label = cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            doc.setFillColor(236, 254, 255);
            doc.rect(margin, y - 3, pageW - margin * 2, 9, 'F');
            doc.setTextColor(6, 182, 212);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.text(label, margin + 3, y + 3);
            y += 10;

            const colCount = 3;
            const colW = (pageW - margin * 2) / colCount;
            items.forEach((item, i) => {
                y = pdfAddPageIfNeeded(doc, y, margin, pageH);
                const col = i % colCount;
                if (col === 0 && i > 0) y += 5.5;
                doc.setTextColor(30, 41, 59);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.text(`• ${item}`, margin + col * colW, y);
                if (col === colCount - 1 || i === items.length - 1) y += 5.5;
            });
            y += 4;
        }
    }

    // Footer on all pages
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(6, 182, 212);
        doc.line(10, pageH - 10, pageW - 10, pageH - 10);
        doc.setTextColor(148, 163, 184);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text('Generated by FitScan — fitscan.app', margin, pageH - 5);
        doc.text(`Page ${i} of ${totalPages}`, pageW - margin, pageH - 5, { align: 'right' });
    }

    doc.save('FitScan_Diet_Plan.pdf');
}


// ═══════════════════════════════════════════════════════════════
//  SCAN REPORT PDF
//  Comprehensive body scan report with all measurements,
//  somatotype analysis, symmetry, proportions, and advice.
// ═══════════════════════════════════════════════════════════════

function exportScanPDF() {
    // Data is injected by dashboard.html as globals
    const scan    = (typeof SCAN_DATA    !== 'undefined') ? SCAN_DATA    : {};
    const profile = (typeof PROFILE_DATA !== 'undefined') ? PROFILE_DATA : {};
    const goals   = (typeof GOALS_DATA   !== 'undefined') ? GOALS_DATA   : [];
    const name    = (typeof USER_NAME    !== 'undefined') ? USER_NAME    : 'User';

    const { jsPDF } = window.jspdf;
    const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW  = doc.internal.pageSize.getWidth();
    const pageH  = doc.internal.pageSize.getHeight();
    const margin = 14;
    const colW   = (pageW - margin * 2);

    // ── Helpers ──────────────────────────────────────────
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const scanDate = scan.scanned_at ? scan.scanned_at.slice(0, 10) : today;

    function checkPage(y, need = 14) {
        if (y + need > pageH - 16) { doc.addPage(); return margin + 4; }
        return y;
    }

    function sectionHeader(y, label, color = [6, 182, 212]) {
        y = checkPage(y, 12);
        doc.setFillColor(...color);
        doc.rect(margin, y, colW, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(255, 255, 255);
        doc.text(label.toUpperCase(), margin + 3, y + 5);
        return y + 10;
    }

    function row(y, label, value, altBg = false) {
        y = checkPage(y, 7);
        if (altBg) { doc.setFillColor(248, 250, 252); doc.rect(margin, y - 1, colW, 7, 'F'); }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);
        doc.text(label, margin + 3, y + 4);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(String(value), pageW - margin - 3, y + 4, { align: 'right' });
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, y + 6.5, pageW - margin, y + 6.5);
        return y + 7;
    }

    function twoColRow(y, items, altBg = false) {
        // items = [{label, value}, ...]  up to 4 per row
        y = checkPage(y, 8);
        if (altBg) { doc.setFillColor(248, 250, 252); doc.rect(margin, y - 1, colW, 8, 'F'); }
        const cellW = colW / items.length;
        items.forEach((item, i) => {
            const x = margin + i * cellW;
            doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
            doc.text(item.label, x + 3, y + 3);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(15, 23, 42);
            doc.text(String(item.value), x + 3, y + 8);
        });
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, y + 9.5, pageW - margin, y + 9.5);
        return y + 11;
    }

    function somatoBar(y, label, value, max, color) {
        y = checkPage(y, 10);
        const barW = colW - 60;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(71, 85, 105);
        doc.text(label, margin + 3, y + 5);
        // track
        doc.setFillColor(226, 232, 240);
        doc.roundedRect(margin + 55, y + 1, barW, 5, 2, 2, 'F');
        // fill
        const fillW = Math.min(value / max, 1) * barW;
        doc.setFillColor(...color);
        doc.roundedRect(margin + 55, y + 1, fillW, 5, 2, 2, 'F');
        // value
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(15, 23, 42);
        doc.text(value.toFixed(2) + ' / ' + max, pageW - margin - 3, y + 5, { align: 'right' });
        return y + 9;
    }

    function symmetryBar(y, label, ratio, assessment) {
        y = checkPage(y, 9);
        const pct = Math.min(Math.round(ratio * 100), 100);
        const barW = colW - 75;
        const col = pct >= 95 ? [16, 185, 129] : pct >= 85 ? [245, 158, 11] : [239, 68, 68];
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(71, 85, 105);
        doc.text(label, margin + 3, y + 5);
        doc.setFillColor(226, 232, 240);
        doc.roundedRect(margin + 60, y + 1, barW, 5, 2, 2, 'F');
        doc.setFillColor(...col);
        doc.roundedRect(margin + 60, y + 1, barW * pct / 100, 5, 2, 2, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...col);
        doc.text(`${pct}% — ${assessment}`, pageW - margin - 3, y + 5, { align: 'right' });
        return y + 9;
    }

    // ── PAGE 1: COVER ──────────────────────────────────────
    // Full cyan header
    doc.setFillColor(6, 182, 212);
    doc.rect(0, 0, pageW, 55, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.text('FitScan', margin, 20);

    doc.setFontSize(13);
    doc.setFont('helvetica', 'normal');
    doc.text('Body Scan Analysis Report', margin, 30);

    doc.setFontSize(9);
    doc.text(`Prepared for: ${name}`, margin, 40);
    doc.text(`Scan Date: ${scanDate}   •   Generated: ${today}`, margin, 47);

    // Body type badge on cover
    const bt = scan.body_type || 'Unknown';
    const btColors = { Endomorph: [239, 68, 68], Mesomorph: [16, 185, 129], Ectomorph: [59, 130, 246] };
    const btCol = btColors[bt] || [6, 182, 212];
    doc.setFillColor(...btCol);
    doc.roundedRect(pageW - margin - 50, 6, 50, 16, 4, 4, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
    doc.text(bt, pageW - margin - 25, 15, { align: 'center' });
    doc.setFontSize(7); doc.text('Body Type', pageW - margin - 25, 20, { align: 'center' });

    let y = 65;

    // ── SECTION 1: Personal Profile ────────────────────────
    y = sectionHeader(y, '1. Personal Profile', [30, 41, 59]);
    y = twoColRow(y, [
        { label: 'Name',   value: name },
        { label: 'Age',    value: profile.age ? profile.age + ' yrs' : '—' },
        { label: 'Gender', value: profile.gender ? (profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1)) : '—' },
        { label: 'Goal',   value: goals.length ? goals[0].replace(/_/g, ' ') : 'General Fitness' },
    ]);
    y = twoColRow(y, [
        { label: 'Height',        value: profile.height_cm ? profile.height_cm + ' cm' : '—' },
        { label: 'Weight',        value: profile.weight_kg ? profile.weight_kg + ' kg' : '—' },
        { label: 'Target Weight', value: profile.target_weight ? profile.target_weight + ' kg' : '—' },
        { label: 'Experience',    value: profile.experience_level || '—' },
    ], true);
    y += 4;

    // ── SECTION 2: Somatotype Analysis ─────────────────────
    y = sectionHeader(y, '2. Somatotype Analysis');
    y = twoColRow(y, [
        { label: 'Body Type',       value: scan.body_type || '—' },
        { label: 'Classification',  value: scan.classification || '—' },
        { label: 'Somatotype',      value: scan.somatotype_rating || '—' },
        { label: 'BMI',             value: scan.bmi ? scan.bmi.toFixed(1) : '—' },
    ]);
    y += 2;
    y = somatoBar(y, 'Endomorphy (Fat Tendency)', scan.endomorphy || 0, 7, [239, 68, 68]);
    y = somatoBar(y, 'Mesomorphy (Muscle Tendency)', scan.mesomorphy || 0, 7, [16, 185, 129]);
    y = somatoBar(y, 'Ectomorphy (Lean Tendency)', scan.ectomorphy || 0, 7, [59, 130, 246]);

    // Dominant type explanation
    y += 2;
    const dominantDesc = {
        Endomorph:  'Higher fat-storage tendency. Focus on calorie control, short rest periods, and consistent cardio alongside compound lifting.',
        Mesomorph:  'Athletic build with efficient nutrient partitioning. Responds well to progressive overload and balanced macros.',
        Ectomorph:  'Lean frame with fast metabolism. Prioritise caloric surplus, heavy compound lifts, and minimal cardio.',
        Unknown:    'Complete a full scan with all measurements for a detailed somatotype classification.',
    };
    y = checkPage(y, 18);
    doc.setFillColor(236, 254, 255);
    doc.rect(margin, y, colW, 14, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(6, 182, 212);
    doc.text('What this means for you:', margin + 3, y + 5);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 41, 59);
    const descLines = doc.splitTextToSize(dominantDesc[bt] || dominantDesc.Unknown, colW - 6);
    doc.text(descLines, margin + 3, y + 10);
    y += Math.max(14, descLines.length * 4.5 + 6) + 4;

    // ── SECTION 3: Body Composition ─────────────────────────
    y = sectionHeader(y, '3. Body Composition', [30, 41, 59]);
    const bmi = scan.bmi || 0;
    const bmiCat = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal Weight' : bmi < 30 ? 'Overweight' : 'Obese';
    y = row(y, 'BMI', `${bmi.toFixed(1)} — ${bmiCat}`);
    y = row(y, 'Endomorphy Score', `${(scan.endomorphy||0).toFixed(2)} / 7.0`, true);
    y = row(y, 'Mesomorphy Score', `${(scan.mesomorphy||0).toFixed(2)} / 7.0`);
    y = row(y, 'Ectomorphy Score', `${(scan.ectomorphy||0).toFixed(2)} / 7.0`, true);
    y += 4;

    // ── SECTION 4: Body Shape Classification ────────────────
    const hmr  = (scan.hmr_data && typeof scan.hmr_data === 'object') ? scan.hmr_data : {};
    const m_cm = hmr.measurements_cm || {};
    const hmrRatios = hmr.ratios || {};

    const sh = m_cm.shoulder || 0, ch = m_cm.chest || 0;
    const wa = m_cm.waist   || 0, hi = m_cm.hip   || 0;
    if (sh > 0 && wa > 0 && hi > 0) {
        const shr = sh / hi, stw = sh / wa, whr = wa / hi, ctw = ch > 0 ? ch / wa : 1;
        let bodyShape = 'Rectangle';
        if (whr > 1.05 && stw < 1.05)       bodyShape = 'Oval';
        else if (shr >= 1.15 && stw >= 1.30) bodyShape = 'Inverted Triangle';
        else if (shr < 0.95)                 bodyShape = 'Triangle';
        else if (shr >= 1.05 && ctw >= 1.10) bodyShape = 'Trapezoid';

        y = sectionHeader(y, '4. Body Shape Classification');
        y = twoColRow(y, [
            { label: 'Body Shape',       value: bodyShape },
            { label: 'Shoulder / Hip',   value: shr.toFixed(2) },
            { label: 'Waist / Hip',      value: whr.toFixed(2) },
            { label: 'Shoulder / Waist', value: stw.toFixed(2) },
        ]);
        y += 4;
    }

    // ── SECTION 5: Body Measurements ────────────────────────
    if (Object.keys(m_cm).length > 0) {
        y = sectionHeader(y, '5. Body Circumferences  (HMR Estimation)', [30, 41, 59]);
        const measItems = [
            ['Chest', m_cm.chest], ['Waist', m_cm.waist], ['Hip', m_cm.hip],
            ['Shoulder Width', m_cm.shoulder], ['Upper Arm', m_cm.upper_arm],
            ['Thigh', m_cm.thigh], ['Belly', m_cm.belly], ['Inseam', m_cm.inseam],
        ];
        let alt = false;
        measItems.forEach(([lbl, val]) => {
            if (val) { y = row(y, lbl, `${val.toFixed(1)} cm`, alt); alt = !alt; }
        });
        y += 4;
    }

    // ── SECTION 6: Limb Lengths ──────────────────────────────
    const pose = (scan.pose_data && typeof scan.pose_data === 'object') ? scan.pose_data : {};
    const j_cm = pose.joint_lengths_cm || {};
    if (Object.keys(j_cm).length > 0) {
        y = sectionHeader(y, '6. Limb Lengths  (MediaPipe Pose)');
        const limbItems = [
            ['L Upper Arm', j_cm.left_upper_arm],   ['R Upper Arm', j_cm.right_upper_arm],
            ['L Forearm', j_cm.left_forearm],        ['R Forearm', j_cm.right_forearm],
            ['Shoulder Width', j_cm.shoulder_width], ['Hip Width', j_cm.hip_width],
            ['L Torso', j_cm.left_torso],            ['R Torso', j_cm.right_torso],
            ['L Thigh', j_cm.left_thigh],            ['R Thigh', j_cm.right_thigh],
            ['L Shin', j_cm.left_shin],              ['R Shin', j_cm.right_shin],
        ];
        let alt = false;
        limbItems.forEach(([lbl, val]) => {
            if (val) { y = row(y, lbl, `${val.toFixed(1)} cm`, alt); alt = !alt; }
        });
        y += 4;
    }

    // ── SECTION 7: Body Ratios ───────────────────────────────
    if (Object.keys(hmrRatios).length > 0) {
        y = sectionHeader(y, '7. Body Ratios', [30, 41, 59]);
        const ratioNames = {
            WHtR: 'Waist-to-Height Ratio', WHR: 'Waist-to-Hip Ratio',
            SHR: 'Shoulder-to-Height Ratio', HWR: 'Height-Weight Ratio',
            LL_H: 'Leg-to-Height Ratio', TVR: 'Torso Volume Ratio',
            UAG_H: 'Upper Arm-to-Height Ratio', TG_H: 'Thigh-to-Height Ratio',
        };
        let alt = false;
        Object.entries(ratioNames).forEach(([key, lbl]) => {
            if (hmrRatios[key] != null) {
                y = row(y, lbl, hmrRatios[key].toFixed(3), alt); alt = !alt;
            }
        });
        y += 4;
    }

    // ── SECTION 8: Symmetry Analysis ────────────────────────
    const symScores = pose.symmetry_scores || {};
    if (Object.keys(symScores).length > 0) {
        y = sectionHeader(y, '8. Body Symmetry Analysis');
        Object.entries(symScores).forEach(([name, info]) => {
            if (typeof info === 'object' && info.ratio != null) {
                y = symmetryBar(y, name, info.ratio, info.assessment || '');
            }
        });
        y += 4;
    }

    // ── SECTION 9: Body Proportions ─────────────────────────
    const bodyProportions = pose.body_proportions || {};
    if (Object.keys(bodyProportions).length > 0) {
        y = sectionHeader(y, '9. Body Proportions', [30, 41, 59]);
        let alt = false;
        Object.entries(bodyProportions).forEach(([name, val]) => {
            if (val != null) {
                y = row(y, name, typeof val === 'number' ? val.toFixed(2) : val, alt);
                alt = !alt;
            }
        });
        y += 4;
    }

    // ── SECTION 10: Personalised Advice ─────────────────────
    y = sectionHeader(y, '10. Personalised Advice & Recommendations');

    const adviceMap = {
        Endomorph: [
            ['Training', 'Prioritise compound movements with short rest periods (30–45s). Include HIIT 2–3×/week. Aim for 12–15 reps per set to maximise calorie burn.'],
            ['Nutrition', 'Lower carbohydrate intake, especially simple sugars. Focus on lean protein (chicken, fish, legumes) and complex carbs timed around workouts.'],
            ['Lifestyle', 'Aim for 8,000–10,000 steps/day on rest days. Drink 3L of water daily. Green tea (2–3 cups) supports fat metabolism.'],
            ['Recovery', 'Sleep 7–8 hours. Foam rolling and active recovery (light walking) on rest days accelerate fat loss.'],
        ],
        Mesomorph: [
            ['Training', 'Progressive overload is your best tool — add 2.5–5 kg or 1–2 reps each week. Vary your program every 4–6 weeks to prevent plateaus.'],
            ['Nutrition', 'Balanced macros work well. Carb-cycle: higher carbs on training days, lower on rest days. Post-workout nutrition within 30 minutes is key.'],
            ['Lifestyle', 'Track progress with photos every 2 weeks. Consistency over 8–12 weeks will show measurable results.'],
            ['Recovery', 'Sleep 7–9 hours — it is your biggest recovery tool. Include 1–2 mobility sessions per week.'],
        ],
        Ectomorph: [
            ['Training', 'Focus on heavy compound lifts (squat, deadlift, bench, row). Keep volume moderate — 3–5 sets of 5–8 reps. Avoid excessive cardio.'],
            ['Nutrition', 'You MUST eat more than you think. Aim for a 400–500 kcal surplus daily. Never skip meals — even one missed meal can set back progress.'],
            ['Lifestyle', 'Limit cardio to 1–2 light sessions per week. Add calorie-dense foods (nut butter, avocado, whole milk, ghee) to hit your surplus easily.'],
            ['Recovery', 'Sleep 8–9 hours for maximum growth hormone release. On rest days, do light stretching only — conserve energy for muscle building.'],
        ],
    };
    const advice = adviceMap[bt] || adviceMap.Mesomorph;
    advice.forEach(([cat, text], i) => {
        y = checkPage(y, 18);
        doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 252 : 255);
        doc.rect(margin, y, colW, 16, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(6, 182, 212);
        doc.text(cat, margin + 3, y + 5);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 41, 59); doc.setFontSize(8);
        const tLines = doc.splitTextToSize(text, colW - 6);
        doc.text(tLines, margin + 3, y + 10);
        y += Math.max(16, tLines.length * 4.2 + 8) + 2;
    });

    // ── Footers on every page ────────────────────────────────
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(6, 182, 212);
        doc.line(10, pageH - 10, pageW - 10, pageH - 10);
        doc.setTextColor(148, 163, 184);
        doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.text('FitScan Body Scan Report — Confidential', margin, pageH - 5);
        doc.text(`Page ${i} of ${totalPages}`, pageW - margin, pageH - 5, { align: 'right' });
    }

    doc.save(`FitScan_Scan_Report_${scanDate}.pdf`);
}
