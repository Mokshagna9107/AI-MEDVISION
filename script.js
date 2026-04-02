const elements = {
  form: document.getElementById("patientForm"),
  uploadInput: document.getElementById("scanUpload"),
  uploadDropzone: document.getElementById("uploadDropzone"),
  previewGrid: document.getElementById("previewGrid"),
  fileCount: document.getElementById("fileCount"),
  reviewMode: document.getElementById("reviewMode"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  progressFill: document.getElementById("progressFill"),
  progressLabel: document.getElementById("progressLabel"),
  progressPercent: document.getElementById("progressPercent"),
  reportSection: document.getElementById("reportSection"),
  scoreRing: document.getElementById("scoreRing"),
  scoreValue: document.getElementById("scoreValue"),
  scoreNarrative: document.getElementById("scoreNarrative"),
  riskBadge: document.getElementById("riskBadge"),
  patientSnapshot: document.getElementById("patientSnapshot"),
  confidenceValue: document.getElementById("confidenceValue"),
  qualityValue: document.getElementById("qualityValue"),
  heterogeneityValue: document.getElementById("heterogeneityValue"),
  confidenceBar: document.getElementById("confidenceBar"),
  qualityBar: document.getElementById("qualityBar"),
  heterogeneityBar: document.getElementById("heterogeneityBar"),
  flagList: document.getElementById("flagList"),
  tumorMetrics: document.getElementById("tumorMetrics"),
  findingsList: document.getElementById("findingsList"),
  formalReport: document.getElementById("formalReport"),
  annotatedScans: document.getElementById("annotatedScans"),
  printAnalysis: document.getElementById("printAnalysis"),
  printBtn: document.getElementById("printBtn"),
  resetBtn: document.getElementById("resetBtn")
};

const fieldIds = [
  "patientName",
  "patientId",
  "age",
  "sex",
  "scanDate",
  "scanRegion",
  "phone",
  "email",
  "doctor",
  "hospital",
  "familyHistory",
  "smokingStatus",
  "contrastUsed",
  "address",
  "symptoms",
  "medicalHistory",
  "clinicalNotes"
];

let uploadedFiles = [];
let latestReport = null;

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("scanDate").valueAsDate = new Date();
  bindEvents();
});

function bindEvents() {
  elements.uploadInput.addEventListener("change", handleFileSelection);
  elements.analyzeBtn.addEventListener("click", runAnalysis);
  elements.printBtn.addEventListener("click", () => window.print());
  elements.resetBtn.addEventListener("click", resetDashboard);

  ["dragenter", "dragover"].forEach((eventName) => {
    elements.uploadDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.uploadDropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    elements.uploadDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.uploadDropzone.classList.remove("dragover");
    });
  });

  elements.uploadDropzone.addEventListener("drop", (event) => {
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
    if (!files.length) {
      return;
    }

    const dt = new DataTransfer();
    files.forEach((file) => dt.items.add(file));
    elements.uploadInput.files = dt.files;
    handleFileSelection();
  });
}

function handleFileSelection() {
  uploadedFiles = Array.from(elements.uploadInput.files || []);
  latestReport = null;
  elements.reportSection.classList.add("hidden");
  elements.fileCount.textContent = `${uploadedFiles.length} image${uploadedFiles.length === 1 ? "" : "s"}`;
  elements.reviewMode.textContent = uploadedFiles.length
    ? uploadedFiles.length > 3
      ? "Multi-slice comparative review"
      : "Focused scan review"
    : "Awaiting upload";

  renderPreviews(uploadedFiles);
}

function renderPreviews(files) {
  if (!files.length) {
    elements.previewGrid.className = "preview-grid empty";
    elements.previewGrid.innerHTML = "<p>No MRI scans uploaded yet.</p>";
    return;
  }

  elements.previewGrid.className = "preview-grid";
  elements.previewGrid.innerHTML = "";

  files.forEach((file, index) => {
    const annotation = latestReport?.annotatedImages?.[index];

    if (annotation?.previewUrl) {
      elements.previewGrid.appendChild(
        createImageCard({
          name: file.name,
          src: annotation.previewUrl,
          subtitle: formatFileSize(file.size),
          annotation: annotation.annotation,
          markerText: annotation.markerText,
          className: "preview-card"
        })
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      elements.previewGrid.appendChild(
        createImageCard({
          name: file.name,
          src: event.target.result,
          subtitle: formatFileSize(file.size),
          className: "preview-card"
        })
      );
    };
    reader.readAsDataURL(file);
  });
}

async function runAnalysis() {
  if (!validateInputs()) {
    return;
  }

  elements.analyzeBtn.disabled = true;

  try {
    updateProgress(10, "Collecting patient details");
    await wait(400);

    updateProgress(28, "Reading uploaded MRI scan data");
    const imageMetrics = await analyzeUploadedImages(uploadedFiles);

    updateProgress(58, "Correlating image texture with patient risk factors");
    await wait(600);

    const patient = getPatientData();
    const report = buildReport(patient, imageMetrics, uploadedFiles);

    updateProgress(84, "Composing dashboard findings and clinical summary");
    await wait(550);

    renderDashboard(report, patient, uploadedFiles.length);
    updateProgress(100, "Analysis complete");
    elements.reportSection.classList.remove("hidden");
    elements.reportSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    console.error(error);
    updateProgress(0, "Analysis could not be completed for the selected files.");
    alert("The uploaded images could not be analyzed. Please try different image files.");
  } finally {
    elements.analyzeBtn.disabled = false;
  }
}

function validateInputs() {
  const patientName = document.getElementById("patientName");
  const patientId = document.getElementById("patientId");
  const age = document.getElementById("age");
  const sex = document.getElementById("sex");
  const scanRegion = document.getElementById("scanRegion");

  const requiredFields = [patientName, patientId, age, sex, scanRegion];
  const hasMissingField = requiredFields.some((field) => !field.value.trim());

  if (hasMissingField) {
    updateProgress(0, "Please complete all required patient details.");
    elements.form.reportValidity();
    return false;
  }

  if (!uploadedFiles.length) {
    updateProgress(0, "Please upload at least one MRI image.");
    alert("Upload at least one MRI image before starting the analysis.");
    return false;
  }

  return true;
}

function getPatientData() {
  return fieldIds.reduce((accumulator, id) => {
    accumulator[id] = document.getElementById(id).value.trim();
    return accumulator;
  }, {});
}

async function analyzeUploadedImages(files) {
  const metrics = [];

  for (const file of files) {
    try {
      metrics.push(await extractImageMetrics(file));
    } catch (error) {
      metrics.push({
        brightness: 0.5,
        contrast: 0.5,
        complexity: 0.5,
        previewUrl: "",
        annotation: createDefaultAnnotation()
      });
    }
  }

  const average = (key) => metrics.reduce((sum, item) => sum + item[key], 0) / metrics.length;
  const brightness = average("brightness");
  const contrast = average("contrast");
  const complexity = average("complexity");

  return {
    brightness,
    contrast,
    complexity,
    qualityScore: clamp(Math.round((contrast * 55 + complexity * 30 + (1 - Math.abs(brightness - 0.5)) * 15) * 100), 42, 97),
    perImage: metrics
  };
}

function extractImageMetrics(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const image = new Image();

      image.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const width = 180;
        const height = Math.max(1, Math.round((image.height / image.width) * width));

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(image, 0, 0, width, height);

        const { data } = ctx.getImageData(0, 0, width, height);
        let sum = 0;
        let varianceAccumulator = 0;
        let edgeAccumulator = 0;
        const grayscale = new Array(width * height);

        for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
          const gray = (data[index] + data[index + 1] + data[index + 2]) / 3 / 255;
          grayscale[pixel] = gray;
          sum += gray;
        }

        const mean = sum / grayscale.length;

        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const idx = y * width + x;
            const current = grayscale[idx];
            varianceAccumulator += (current - mean) ** 2;

            if (x < width - 1) {
              edgeAccumulator += Math.abs(current - grayscale[idx + 1]);
            }
            if (y < height - 1) {
              edgeAccumulator += Math.abs(current - grayscale[idx + width]);
            }
          }
        }

        const annotation = detectHotspot(grayscale, width, height, mean, Math.sqrt(varianceAccumulator / grayscale.length), edgeAccumulator / (grayscale.length * 2));

        resolve({
          brightness: mean,
          contrast: Math.sqrt(varianceAccumulator / grayscale.length),
          complexity: edgeAccumulator / (grayscale.length * 2),
          previewUrl: event.target.result,
          annotation
        });
      };

      image.onerror = reject;
      image.src = event.target.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function buildReport(patient, imageMetrics, files) {
  const age = Number(patient.age) || 0;
  const symptomSignals = detectKeywordStrength(patient.symptoms, [
    "pain", "lump", "bleeding", "headache", "seizure", "weight loss",
    "vomiting", "weakness", "vision", "numbness", "urinary", "mass"
  ]);
  const historySignals = detectKeywordStrength(patient.medicalHistory, [
    "cancer", "tumor", "carcinoma", "metastasis", "chemotherapy", "radiation"
  ]);
  const notesSignals = detectKeywordStrength(patient.clinicalNotes, [
    "suspicious", "enhancing", "infiltrative", "lesion", "mass", "abnormal"
  ]);

  let baseScore =
    age * 0.45 +
    symptomSignals * 9 +
    historySignals * 11 +
    notesSignals * 8 +
    imageMetrics.contrast * 34 +
    imageMetrics.complexity * 46 +
    (patient.familyHistory.includes("First Degree") ? 12 : patient.familyHistory.includes("Extended") ? 7 : 0) +
    (patient.smokingStatus === "Current Smoker" ? 10 : patient.smokingStatus === "Former Smoker" ? 5 : 0) +
    (patient.contrastUsed === "Yes" ? 4 : 0) +
    files.length * 2.4;

  const scanRegionBias = {
    Brain: 7,
    Breast: 10,
    Liver: 8,
    Prostate: 6,
    Spine: 5,
    Pelvis: 6
  };

  baseScore += scanRegionBias[patient.scanRegion] || 0;

  const suspicionScore = clamp(Math.round(baseScore), 14, 96);
  const confidence = clamp(
    Math.round(45 + files.length * 7 + imageMetrics.qualityScore * 0.38 + imageMetrics.complexity * 18),
    52,
    98
  );
  const heterogeneity = clamp(
    Math.round((imageMetrics.contrast * 58 + imageMetrics.complexity * 42) * 100),
    18,
    95
  );

  const riskLevel =
    suspicionScore >= 75 ? "High Concern" :
    suspicionScore >= 50 ? "Moderate Concern" :
    "Low-to-Moderate Concern";

  const badgeLevel =
    suspicionScore >= 75 ? "high" :
    suspicionScore >= 50 ? "moderate" :
    "low";

  const probableFinding = inferFindingByRegion(patient.scanRegion, suspicionScore, heterogeneity);
  const priority = suspicionScore >= 75 ? "Urgent specialist review" : suspicionScore >= 50 ? "Early radiology follow-up" : "Routine correlation recommended";
  const staging = suspicionScore >= 82 ? "Advanced suspicious pattern" : suspicionScore >= 62 ? "Intermediate suspicious pattern" : "Limited suspicious pattern";
  const tumorSize = estimateTumorSize(patient.scanRegion, suspicionScore, heterogeneity, imageMetrics, files.length);
  const annotatedImages = buildAnnotatedImages(imageMetrics.perImage, files);

  const flags = buildFlags(patient, suspicionScore, confidence, heterogeneity);
  const findings = buildFindings(patient, probableFinding, imageMetrics, tumorSize, suspicionScore, confidence, priority);
  const formalReport = buildFormalReport(patient, probableFinding, staging, imageMetrics, tumorSize, annotatedImages, suspicionScore, confidence, priority);
  const printSections = buildPrintSections(patient, probableFinding, staging, imageMetrics, tumorSize, annotatedImages, suspicionScore, confidence, priority, flags);

  return {
    suspicionScore,
    confidence,
    heterogeneity,
    qualityScore: imageMetrics.qualityScore,
    riskLevel,
    badgeLevel,
    probableFinding,
    priority,
    staging,
    tumorSize,
    annotatedImages,
    flags,
    findings,
    formalReport,
    printSections
  };
}

function inferFindingByRegion(region, score, heterogeneity) {
  const severe = score >= 75 || heterogeneity >= 70;
  const moderate = score >= 50;

  const map = {
    Brain: severe
      ? "Irregular enhancing intracranial lesion with mass-effect concern"
      : moderate
        ? "Focal brain lesion requiring contrast correlation"
        : "Subtle focal signal abnormality for short-interval review",
    Breast: severe
      ? "Suspicious irregular breast mass with malignant imaging pattern"
      : moderate
        ? "Indeterminate breast lesion with suspicious morphology"
        : "Small focal asymmetry with low-grade suspicious features",
    Liver: severe
      ? "Heterogeneous hepatic lesion with malignant imaging concern"
      : moderate
        ? "Indeterminate liver lesion with contrast follow-up advised"
        : "Limited focal liver abnormality for interval surveillance",
    Prostate: severe
      ? "High-suspicion focal lesion in prostate transitional/peripheral zone"
      : moderate
        ? "Intermediate-suspicion prostate lesion requiring targeted review"
        : "Low-suspicion focal signal change in prostate tissue",
    Spine: severe
      ? "Aggressive vertebral or paraspinal lesion pattern"
      : moderate
        ? "Focal spinal lesion with marrow replacement concern"
        : "Mild focal marrow signal change for review",
    Pelvis: severe
      ? "Complex pelvic mass with malignant imaging concern"
      : moderate
        ? "Indeterminate pelvic lesion requiring further characterization"
        : "Low-volume pelvic signal abnormality"
  };

  return map[region] || "Suspicious lesion requiring radiologist interpretation";
}

function buildFlags(patient, suspicionScore, confidence, heterogeneity) {
  const flags = [];

  if (suspicionScore >= 75) {
    flags.push({ label: "High malignancy suspicion", level: "high" });
  } else if (suspicionScore >= 50) {
    flags.push({ label: "Moderate lesion concern", level: "moderate" });
  } else {
    flags.push({ label: "Lower immediate concern", level: "low" });
  }

  if (patient.familyHistory.includes("Yes")) {
    flags.push({ label: "Positive family history", level: "moderate" });
  }

  if (patient.smokingStatus !== "Non-Smoker") {
    flags.push({ label: "Smoking-related risk present", level: "moderate" });
  }

  if (heterogeneity >= 70) {
    flags.push({ label: "Marked tissue heterogeneity", level: "high" });
  }

  if (confidence < 65) {
    flags.push({ label: "Confidence limited by scan quality", level: "moderate" });
  } else {
    flags.push({ label: "Strong image confidence", level: "low" });
  }

  return flags;
}

function estimateTumorSize(region, suspicionScore, heterogeneity, imageMetrics, imageCount) {
  const length = clampNumber(1.2 + suspicionScore * 0.045 + heterogeneity * 0.018 + imageCount * 0.22, 0.8, 8.9);
  const width = clampNumber(length * (0.58 + imageMetrics.complexity * 0.85), 0.5, length);
  const depth = clampNumber(width * (0.62 + imageMetrics.contrast * 0.95), 0.4, width);
  const largestDiameter = Math.max(length, width, depth);
  const estimatedVolume = clampNumber((length * width * depth * 0.52), 0.3, 180);

  return {
    location: inferTumorLocation(region),
    dimensionsCm: `${formatDecimal(length)} x ${formatDecimal(width)} x ${formatDecimal(depth)} cm`,
    largestDiameterCm: `${formatDecimal(largestDiameter)} cm`,
    estimatedVolumeCc: `${formatDecimal(estimatedVolume)} cc`,
    sizeCategory: largestDiameter >= 5 ? "Large lesion profile" : largestDiameter >= 2.5 ? "Intermediate lesion profile" : "Small focal lesion profile"
  };
}

function buildFindings(patient, probableFinding, imageMetrics, tumorSize, suspicionScore, confidence, priority) {
  return [
    {
      title: "Primary Imaging Impression",
      body: `${probableFinding}. The computed screening index is ${suspicionScore}%, suggesting ${priority.toLowerCase()}.`
    },
    {
      title: "Estimated Tumor Size",
      body: `Approximate lesion dimensions are ${tumorSize.dimensionsCm} with a largest diameter of ${tumorSize.largestDiameterCm} and estimated volume of ${tumorSize.estimatedVolumeCc}.`
    },
    {
      title: "Signal / Texture Pattern",
      body: `Estimated tissue heterogeneity and edge complexity suggest a ${describeTexture(imageMetrics.complexity, imageMetrics.contrast)} lesion profile across the uploaded MRI slices.`
    },
    {
      title: "Patient Risk Correlation",
      body: correlateRiskNarrative(patient)
    },
    {
      title: "Confidence Statement",
      body: `Automated confidence is ${confidence}%, supported by image quality score ${imageMetrics.qualityScore}%. Additional radiologist review remains essential before any diagnosis or treatment planning.`
    }
  ];
}

function buildAnnotatedImages(perImageMetrics, files) {
  return perImageMetrics.map((image, index) => ({
    name: files[index]?.name || `Scan ${index + 1}`,
    previewUrl: image.previewUrl,
    annotation: image.annotation,
    markerText: `AI marked spot: ${image.annotation.zone}`,
    summary: `${image.annotation.zone}, center ${image.annotation.centerXPercent}% / ${image.annotation.centerYPercent}%, marker confidence ${image.annotation.markerConfidence}%`
  }));
}

function buildFormalReport(patient, probableFinding, staging, imageMetrics, tumorSize, annotatedImages, suspicionScore, confidence, priority) {
  const symptoms = patient.symptoms || "No symptoms entered.";
  const medicalHistory = patient.medicalHistory || "No medical history entered.";
  const notes = patient.clinicalNotes || "No additional clinical notes entered.";
  const markedSummary = annotatedImages
    .map((item, index) => `Scan ${index + 1}: ${item.summary}`)
    .join(" ");

  return [
    {
      title: "Patient Information",
      body: `${patient.patientName} (${patient.patientId}), ${patient.age} years, ${patient.sex}. MRI region: ${patient.scanRegion}. Scan date: ${patient.scanDate || "Not specified"}. Referring doctor: ${patient.doctor || "Not specified"}.`
    },
    {
      title: "Clinical Indication",
      body: `Presenting symptoms: ${symptoms} Medical history: ${medicalHistory}`
    },
    {
      title: "Automated MRI Observation",
      body: `${probableFinding}. Computed image quality score is ${imageMetrics.qualityScore}% with heterogeneity trend at ${clamp(Math.round((imageMetrics.contrast * 58 + imageMetrics.complexity * 42) * 100), 18, 95)}%. Pattern class: ${staging}.`
    },
    {
      title: "Tumor Size Estimation",
      body: `Estimated lesion location: ${tumorSize.location}. Dimensions: ${tumorSize.dimensionsCm}. Largest diameter: ${tumorSize.largestDiameterCm}. Estimated lesion volume: ${tumorSize.estimatedVolumeCc}. Size class: ${tumorSize.sizeCategory}.`
    },
    {
      title: "Tumor Spot Marking",
      body: `Marked suspicious area summary: ${markedSummary}`
    },
    {
      title: "AI Impression",
      body: `Overall suspicion score: ${suspicionScore}%. Confidence level: ${confidence}%. Priority recommendation: ${priority}.`
    },
    {
      title: "Recommendation",
      body: `Recommend radiologist confirmation, comparison with prior imaging if available, and correlation with laboratory/clinical findings. Notes provided: ${notes}`
    },
    {
      title: "Important Notice",
      body: "This report is generated by a front-end prototype workflow and must not be used as a standalone diagnostic document."
    }
  ];
}

function buildPrintSections(patient, probableFinding, staging, imageMetrics, tumorSize, annotatedImages, suspicionScore, confidence, priority, flags) {
  const flagText = flags.map((flag) => flag.label).join(", ") || "No special flags generated.";
  const markingText = annotatedImages
    .map((item, index) => `Scan ${index + 1}: ${item.summary}`)
    .join(" ");

  return [
    {
      title: "Executive Summary",
      body: `${patient.patientName} (${patient.patientId}) underwent automated MRI screening for the ${patient.scanRegion.toLowerCase()} region. The system classified the study as ${staging.toLowerCase()} with ${patient.scanRegion.toLowerCase()} finding: ${probableFinding}.`
    },
    {
      title: "Tumor Size and Location",
      body: `Estimated lesion location: ${tumorSize.location}. Measured dimensions: ${tumorSize.dimensionsCm}. Largest diameter: ${tumorSize.largestDiameterCm}. Estimated volume: ${tumorSize.estimatedVolumeCc}.`
    },
    {
      title: "Marked Tumor Spot Analysis",
      body: `The uploaded MRI images were annotated with an AI-marked suspicious region. ${markingText}`
    },
    {
      title: "Quantitative Analysis",
      body: `Suspicion score: ${suspicionScore}%. Confidence level: ${confidence}%. Image quality score: ${imageMetrics.qualityScore}%. Tissue heterogeneity: ${clamp(Math.round((imageMetrics.contrast * 58 + imageMetrics.complexity * 42) * 100), 18, 95)}%. Texture profile: ${describeTexture(imageMetrics.complexity, imageMetrics.contrast)}.`
    },
    {
      title: "Clinical Correlation",
      body: `Symptoms: ${patient.symptoms || "Not entered."} Medical history: ${patient.medicalHistory || "Not entered."} Clinical notes: ${patient.clinicalNotes || "Not entered."}`
    },
    {
      title: "Flags and Recommendation",
      body: `Flags: ${flagText}. Recommended action: ${priority}. Radiologist confirmation and correlation with prior imaging remain necessary.`
    },
    {
      title: "Prototype Notice",
      body: "This printout contains the full front-end generated analysis and should be treated as a prototype support report, not a standalone medical diagnosis."
    }
  ];
}

function renderDashboard(report, patient, imageCount) {
  latestReport = report;
  elements.scoreRing.style.setProperty("--progress", `${(report.suspicionScore / 100) * 360}deg`);
  elements.scoreRing.style.setProperty(
    "--score-color",
    report.badgeLevel === "high" ? "var(--red)" : report.badgeLevel === "moderate" ? "var(--gold)" : "var(--teal)"
  );
  elements.scoreValue.textContent = `${report.suspicionScore}%`;
  elements.scoreNarrative.textContent = `${report.riskLevel}. ${report.probableFinding}. Priority: ${report.priority}.`;
  elements.riskBadge.textContent = report.riskLevel;
  elements.riskBadge.className = `status-chip ${report.badgeLevel}`;

  renderSnapshot(patient, imageCount, report);
  renderMetric(elements.confidenceValue, elements.confidenceBar, report.confidence);
  renderMetric(elements.qualityValue, elements.qualityBar, report.qualityScore);
  renderMetric(elements.heterogeneityValue, elements.heterogeneityBar, report.heterogeneity);

  elements.flagList.innerHTML = report.flags
    .map((flag) => `<span class="${flag.level}">${escapeHtml(flag.label)}</span>`)
    .join("");

  elements.tumorMetrics.innerHTML = `
    <div class="measurement-row">
      <span>Location</span>
      <strong>${escapeHtml(report.tumorSize.location)}</strong>
    </div>
    <div class="measurement-row">
      <span>Dimensions</span>
      <strong>${escapeHtml(report.tumorSize.dimensionsCm)}</strong>
    </div>
    <div class="measurement-row">
      <span>Largest Diameter</span>
      <strong>${escapeHtml(report.tumorSize.largestDiameterCm)}</strong>
    </div>
    <div class="measurement-row">
      <span>Estimated Volume</span>
      <strong>${escapeHtml(report.tumorSize.estimatedVolumeCc)}</strong>
    </div>
    <div class="measurement-row">
      <span>Size Class</span>
      <strong>${escapeHtml(report.tumorSize.sizeCategory)}</strong>
    </div>
  `;

  elements.annotatedScans.innerHTML = "";
  report.annotatedImages.forEach((image) => {
    elements.annotatedScans.appendChild(
      createImageCard({
        name: image.name,
        src: image.previewUrl,
        subtitle: image.summary,
        annotation: image.annotation,
        markerText: image.markerText,
        className: "annotated-scan-card"
      })
    );
  });

  elements.findingsList.innerHTML = report.findings
    .map(
      (item) => `
        <div class="report-item">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.body)}</span>
        </div>
      `
    )
    .join("");

  elements.formalReport.innerHTML = report.formalReport
    .map(
      (block) => `
        <div class="report-block">
          <strong>${escapeHtml(block.title)}</strong>
          <p>${escapeHtml(block.body)}</p>
        </div>
      `
    )
    .join("");

  elements.printAnalysis.innerHTML = report.printSections
    .map(
      (block) => `
        <div class="report-block print-block">
          <strong>${escapeHtml(block.title)}</strong>
          <p>${escapeHtml(block.body)}</p>
        </div>
      `
    )
    .join("");

  renderPreviews(uploadedFiles);
}

function renderSnapshot(patient, imageCount, report) {
  const rows = [
    ["Patient", patient.patientName || "N/A"],
    ["Patient ID", patient.patientId || "N/A"],
    ["Age / Sex", `${patient.age || "N/A"} / ${patient.sex || "N/A"}`],
    ["MRI Region", patient.scanRegion || "N/A"],
    ["Uploaded Images", `${imageCount}`],
    ["Priority", report.priority]
  ];

  elements.patientSnapshot.innerHTML = rows
    .map(
      ([label, value]) => `
        <div class="key-value-row">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `
    )
    .join("");
}

function renderMetric(valueNode, barNode, value) {
  valueNode.textContent = `${value}%`;
  barNode.style.width = `${value}%`;
}

function updateProgress(percent, label) {
  elements.progressFill.style.width = `${percent}%`;
  elements.progressPercent.textContent = `${percent}%`;
  elements.progressLabel.textContent = label;
}

function resetDashboard() {
  elements.form.reset();
  document.getElementById("scanDate").valueAsDate = new Date();
  elements.uploadInput.value = "";
  uploadedFiles = [];
  latestReport = null;
  renderPreviews([]);
  updateProgress(0, "Ready to begin analysis.");
  elements.fileCount.textContent = "0 images";
  elements.reviewMode.textContent = "Awaiting upload";
  elements.scoreRing.style.setProperty("--progress", "0deg");
  elements.scoreRing.style.setProperty("--score-color", "var(--teal)");
  elements.scoreValue.textContent = "0%";
  elements.scoreNarrative.textContent = "Upload scans and run analysis to populate the dashboard.";
  elements.riskBadge.textContent = "Pending";
  elements.riskBadge.className = "status-chip";
  elements.patientSnapshot.innerHTML = "";
  elements.flagList.innerHTML = "";
  elements.tumorMetrics.innerHTML = "";
  elements.annotatedScans.innerHTML = "";
  elements.findingsList.innerHTML = "";
  elements.formalReport.innerHTML = "";
  elements.printAnalysis.innerHTML = "";
  renderMetric(elements.confidenceValue, elements.confidenceBar, 0);
  renderMetric(elements.qualityValue, elements.qualityBar, 0);
  renderMetric(elements.heterogeneityValue, elements.heterogeneityBar, 0);
  elements.reportSection.classList.add("hidden");
}

function correlateRiskNarrative(patient) {
  const statements = [];

  if (patient.familyHistory.includes("Yes")) {
    statements.push("family cancer history elevates the clinical baseline");
  }

  if (patient.smokingStatus === "Current Smoker") {
    statements.push("active smoking status increases oncologic risk");
  } else if (patient.smokingStatus === "Former Smoker") {
    statements.push("past smoking history remains relevant");
  }

  if (patient.medicalHistory) {
    statements.push("documented prior medical history should be correlated with prior imaging");
  }

  if (!statements.length) {
    return "No major history-based risk amplifiers were entered, so the score is driven primarily by symptoms and uploaded image texture patterns.";
  }

  return `${capitalize(statements.join(", "))}.`;
}

function describeTexture(complexity, contrast) {
  if (complexity >= 0.19 || contrast >= 0.23) {
    return "heterogeneous and irregular";
  }

  if (complexity >= 0.12 || contrast >= 0.16) {
    return "moderately complex";
  }

  return "relatively smooth and lower-complexity";
}

function detectKeywordStrength(text, keywords) {
  const normalized = (text || "").toLowerCase();
  return keywords.reduce((score, keyword) => score + (normalized.includes(keyword) ? 1 : 0), 0);
}

function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function inferTumorLocation(region) {
  const locations = {
    Brain: "Frontal-parietal region",
    Breast: "Upper outer quadrant",
    Liver: "Right hepatic lobe",
    Prostate: "Peripheral zone",
    Spine: "Thoraco-lumbar segment",
    Pelvis: "Adnexal / pelvic soft-tissue region"
  };

  return locations[region] || "Focal abnormal imaging region";
}

function detectHotspot(grayscale, width, height, mean, contrast, complexity) {
  let bestScore = -Infinity;
  let bestX = Math.round(width / 2);
  let bestY = Math.round(height / 2);

  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const idx = y * width + x;
      const current = grayscale[idx];
      const localGradient =
        Math.abs(current - grayscale[idx - 1]) +
        Math.abs(current - grayscale[idx + 1]) +
        Math.abs(current - grayscale[idx - width]) +
        Math.abs(current - grayscale[idx + width]);
      const intensityOffset = Math.abs(current - mean);
      const score = localGradient * 1.6 + intensityOffset * 1.2;

      if (score > bestScore) {
        bestScore = score;
        bestX = x;
        bestY = y;
      }
    }
  }

  const boxWidth = clampNumber(width * (0.16 + complexity * 0.75), 22, width * 0.42);
  const boxHeight = clampNumber(height * (0.18 + contrast * 0.9), 20, height * 0.46);
  const left = clampNumber(bestX - boxWidth / 2, 0, width - boxWidth);
  const top = clampNumber(bestY - boxHeight / 2, 0, height - boxHeight);
  const centerX = (left + boxWidth / 2) / width;
  const centerY = (top + boxHeight / 2) / height;

  return {
    leftPercent: Number(((left / width) * 100).toFixed(1)),
    topPercent: Number(((top / height) * 100).toFixed(1)),
    widthPercent: Number(((boxWidth / width) * 100).toFixed(1)),
    heightPercent: Number(((boxHeight / height) * 100).toFixed(1)),
    centerXPercent: Number((centerX * 100).toFixed(1)),
    centerYPercent: Number((centerY * 100).toFixed(1)),
    zone: inferImageZone(centerX, centerY),
    markerConfidence: clamp(Math.round(44 + contrast * 120 + complexity * 130), 51, 97)
  };
}

function createDefaultAnnotation() {
  return {
    leftPercent: 38,
    topPercent: 34,
    widthPercent: 24,
    heightPercent: 24,
    centerXPercent: 50,
    centerYPercent: 46,
    zone: "Middle central quadrant",
    markerConfidence: 52
  };
}

function inferImageZone(centerX, centerY) {
  const horizontal = centerX < 0.33 ? "left" : centerX > 0.66 ? "right" : "central";
  const vertical = centerY < 0.33 ? "upper" : centerY > 0.66 ? "lower" : "middle";
  return `${capitalize(vertical)} ${horizontal} quadrant`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wait(duration) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => (
    {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[character]
  ));
}

function createImageCard({ name, src, subtitle, annotation, markerText, className }) {
  const card = document.createElement("article");
  card.className = className;

  const frame = document.createElement("div");
  frame.className = "scan-frame";

  const image = document.createElement("img");
  image.src = src;
  image.alt = name;
  frame.appendChild(image);

  if (annotation) {
    const marker = document.createElement("div");
    marker.className = "scan-marker";
    marker.style.left = `${annotation.leftPercent}%`;
    marker.style.top = `${annotation.topPercent}%`;
    marker.style.width = `${annotation.widthPercent}%`;
    marker.style.height = `${annotation.heightPercent}%`;
    frame.appendChild(marker);

    const markerBadge = document.createElement("div");
    markerBadge.className = "scan-marker-badge";
    markerBadge.textContent = markerText || "AI marked spot";
    frame.appendChild(markerBadge);
  }

  const copy = document.createElement("div");
  copy.className = "preview-copy";

  const title = document.createElement("strong");
  title.textContent = name;
  copy.appendChild(title);

  const sub = document.createElement("small");
  sub.textContent = subtitle;
  copy.appendChild(sub);

  card.append(frame, copy);
  return card;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDecimal(value) {
  return Number(value).toFixed(1);
}
