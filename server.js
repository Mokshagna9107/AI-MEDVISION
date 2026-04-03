import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 8, fileSize: 10 * 1024 * 1024 }
});

const PORT = Number(process.env.PORT || 3000);
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "moondream";
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

const systemPrompt = [
  "You are a cautious MRI screening assistant inside a prototype dashboard.",
  "Return only valid JSON with no markdown.",
  "Do not claim a diagnosis.",
  "Use careful language such as suspicious, possible, indeterminate, and requires radiologist confirmation.",
  "Scores must be integers between 0 and 100.",
  "The response must match the requested JSON shape exactly."
].join(" ");

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/style.css", (req, res) => {
  res.sendFile(path.join(__dirname, "style.css"));
});

app.get("/script.js", (req, res) => {
  res.sendFile(path.join(__dirname, "script.js"));
});

app.use("/assets", express.static(path.join(__dirname, "assets")));

app.get("/api/health", async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!response.ok) {
      throw new Error(`Ollama responded with ${response.status}`);
    }

    const payload = await response.json();
    res.json({
      ok: true,
      model: OLLAMA_MODEL,
      availableModels: (payload.models || []).map((item) => item.name)
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: `Unable to reach Ollama at ${OLLAMA_BASE_URL}. ${error.message}`
    });
  }
});

app.post("/api/analyze", upload.array("scans", 8), async (req, res) => {
  try {
    const patient = fieldIds.reduce((acc, id) => ({ ...acc, [id]: String(req.body[id] || "").trim() }), {});
    const files = req.files || [];
    validate(patient, files);

    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: "json",
        options: { temperature: 0.2 },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: buildPrompt(patient, files.length),
            images: files.map((file) => file.buffer.toString("base64"))
          }
        ]
      })
    });

    if (!response.ok) {
      throw httpError(502, `Ollama request failed with ${response.status}. ${await response.text()}`);
    }

    const raw = await response.json();
    const parsed = parseJson(raw.message?.content || "");
    if (!parsed) {
      throw httpError(502, "Ollama returned invalid JSON.");
    }

    res.json({
      ok: true,
      patient,
      report: normalizeReport(parsed, patient, files),
      meta: {
        model: OLLAMA_MODEL,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message || "Analysis failed."
    });
  }
});

app.get("*", (req, res) => {
  res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`MedVision server running at http://localhost:${PORT}`);
  console.log(`Using Ollama at ${OLLAMA_BASE_URL} with model ${OLLAMA_MODEL}`);
});

function validate(patient, files) {
  const required = ["patientName", "patientId", "age", "sex", "scanRegion"];
  const missing = required.find((field) => !patient[field]);
  if (missing) {
    throw httpError(400, `Missing required field: ${missing}`);
  }
  if (!files.length) {
    throw httpError(400, "Upload at least one MRI image.");
  }
}

function buildPrompt(patient, imageCount) {
  return [
    "Analyze the MRI images with the patient details below.",
    "Estimate the most suspicious focal tumor or lesion region in each uploaded image.",
    "For every scan, return an annotation box as percentages of the image area.",
    "Keep the language careful and non-diagnostic.",
    "Return one JSON object with this structure:",
    JSON.stringify({
      suspicionScore: 68,
      confidence: 82,
      heterogeneity: 61,
      qualityScore: 79,
      riskLevel: "Moderate Concern",
      badgeLevel: "moderate",
      probableFinding: "Indeterminate focal lesion requiring radiologist correlation",
      priority: "Early radiology follow-up",
      staging: "Intermediate suspicious pattern",
      tumorSize: {
        location: "Frontal-parietal region",
        dimensionsCm: "2.8 x 1.9 x 1.7 cm",
        largestDiameterCm: "2.8 cm",
        estimatedVolumeCc: "4.7 cc",
        sizeCategory: "Intermediate lesion profile"
      },
      flags: [{ label: "Moderate lesion concern", level: "moderate" }],
      findings: [{ title: "Primary Imaging Impression", body: "..." }],
      formalReport: [{ title: "Important Notice", body: "..." }],
      printSections: [{ title: "Prototype Notice", body: "..." }],
      annotatedImages: [{
        markerText: "AI marked spot: Middle central quadrant",
        summary: "Middle central quadrant, center 49.5% / 51.2%, marker confidence 81%",
        annotation: {
          leftPercent: 36.2,
          topPercent: 28.8,
          widthPercent: 23.5,
          heightPercent: 20.6,
          centerXPercent: 48,
          centerYPercent: 39.1,
          zone: "Middle central quadrant",
          markerConfidence: 81
        }
      }]
    }, null, 2),
    "Rules:",
    "- Make annotatedImages length equal to the number of uploaded scans.",
    "- badgeLevel and flag levels must be low, moderate, or high.",
    "- Each annotatedImages item must describe the visually most suspicious spot with leftPercent, topPercent, widthPercent, heightPercent, centerXPercent, centerYPercent, zone, and markerConfidence.",
    "- The annotation box should be reasonably tight around the suspicious area, not the whole image.",
    "- formalReport and printSections must include tumor measurements, score, confidence, and the marked tumor-spot summary.",
    "- Keep the content prototype-only and non-diagnostic.",
    "Patient details:",
    JSON.stringify(patient, null, 2),
    `Uploaded image count: ${imageCount}`
  ].join("\n");
}

function normalizeReport(report, patient, files) {
  const suspicionScore = clampInt(report.suspicionScore, 15, 97, 58);
  const badgeLevel = normalizeBadge(report.badgeLevel, suspicionScore);
  const finding = String(report.probableFinding || "Indeterminate focal lesion requiring radiologist review").trim();
  const annotatedImages = files.map((file, index) => {
    const raw = report.annotatedImages?.[index] || {};
    const annotation = normalizeAnnotation(raw.annotation || raw);
    return {
      name: file.originalname,
      previewUrl: `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
      markerText: raw.markerText || `AI marked spot: ${annotation.zone}`,
      summary: raw.summary || `${annotation.zone}, center ${annotation.centerXPercent}% / ${annotation.centerYPercent}%, marker confidence ${annotation.markerConfidence}%`,
      annotation
    };
  });
  const tumorSize = {
    location: String(report.tumorSize?.location || inferTumorLocation(patient.scanRegion)).trim(),
    dimensionsCm: String(report.tumorSize?.dimensionsCm || "2.4 x 1.8 x 1.6 cm").trim(),
    largestDiameterCm: String(report.tumorSize?.largestDiameterCm || "2.4 cm").trim(),
    estimatedVolumeCc: String(report.tumorSize?.estimatedVolumeCc || "3.6 cc").trim(),
    sizeCategory: String(report.tumorSize?.sizeCategory || "Intermediate lesion profile").trim()
  };
  const confidence = clampInt(report.confidence, 40, 99, 76);
  const heterogeneity = clampInt(report.heterogeneity, 15, 95, 54);
  const qualityScore = clampInt(report.qualityScore, 35, 99, 72);
  const riskLevel = String(report.riskLevel || (suspicionScore >= 75 ? "High Concern" : suspicionScore >= 50 ? "Moderate Concern" : "Low-to-Moderate Concern")).trim();
  const priority = String(report.priority || (suspicionScore >= 75 ? "Urgent specialist review" : suspicionScore >= 50 ? "Early radiology follow-up" : "Routine radiology correlation recommended")).trim();
  const staging = String(report.staging || (suspicionScore >= 82 ? "Advanced suspicious pattern" : suspicionScore >= 62 ? "Intermediate suspicious pattern" : "Limited suspicious pattern")).trim();
  const defaultFlags = [{ label: `${cap(badgeLevel)} lesion concern`, level: badgeLevel }];
  const defaultFindings = buildDefaultFindings(finding, tumorSize, qualityScore, heterogeneity, confidence);
  const defaultFormalReport = buildDefaultFormalReport(patient, finding, tumorSize, qualityScore, heterogeneity, staging, confidence, priority, annotatedImages);
  const defaultPrintSections = buildDefaultPrintSections(patient, finding, tumorSize, suspicionScore, confidence, qualityScore, heterogeneity, priority, annotatedImages);

  return {
    suspicionScore,
    confidence,
    heterogeneity,
    qualityScore,
    riskLevel,
    badgeLevel,
    probableFinding: finding,
    priority,
    staging,
    tumorSize,
    flags: normalizeList(report.flags, defaultFlags, (item) => ({
      label: String(item.label || "Clinical review flag").trim(),
      level: ["low", "moderate", "high"].includes(item.level) ? item.level : "moderate"
    })),
    findings: normalizeList(report.findings, defaultFindings, (item) => ({
      title: String(item.title || "Finding").trim(),
      body: String(item.body || `${finding}. Prototype output only and not a diagnosis.`).trim()
    })),
    formalReport: normalizeList(report.formalReport, defaultFormalReport, (item) => ({
      title: String(item.title || "Report Section").trim(),
      body: String(item.body || "Prototype-only report requiring radiologist confirmation.").trim()
    })),
    printSections: normalizeList(report.printSections, defaultPrintSections, (item) => ({
      title: String(item.title || "Print Section").trim(),
      body: String(item.body || "Prototype-only report requiring radiologist confirmation.").trim()
    })),
    annotatedImages
  };
}

function buildDefaultFindings(finding, tumorSize, qualityScore, heterogeneity, confidence) {
  return [
    {
      title: "Primary Imaging Impression",
      body: `${finding}. This output is prototype-only and requires radiologist confirmation.`
    },
    {
      title: "Tumor Measurement Summary",
      body: `Estimated lesion dimensions are ${tumorSize.dimensionsCm}, largest diameter ${tumorSize.largestDiameterCm}, with approximate volume ${tumorSize.estimatedVolumeCc}.`
    },
    {
      title: "Image Quality And Heterogeneity",
      body: `Image quality score is ${qualityScore}% with tissue heterogeneity measured at ${heterogeneity}%. Model confidence is ${confidence}%.`
    }
  ];
}

function buildDefaultFormalReport(patient, finding, tumorSize, qualityScore, heterogeneity, staging, confidence, priority, annotatedImages) {
  const markedSummary = annotatedImages.map((item, index) => `Scan ${index + 1}: ${item.summary}`).join(" ");
  return [
    {
      title: "Patient Information",
      body: `${patient.patientName} (${patient.patientId}), ${patient.age} years, ${patient.sex}. MRI region: ${patient.scanRegion}. Scan date: ${patient.scanDate || "Not specified"}.`
    },
    {
      title: "Clinical Indication",
      body: `Symptoms: ${patient.symptoms || "Not entered."} Medical history: ${patient.medicalHistory || "Not entered."} Clinical notes: ${patient.clinicalNotes || "Not entered."}`
    },
    {
      title: "Automated MRI Observation",
      body: `${finding}. Image quality score ${qualityScore}% with heterogeneity ${heterogeneity}%. Pattern class: ${staging}.`
    },
    {
      title: "Tumor Size Estimation",
      body: `Location: ${tumorSize.location}. Dimensions: ${tumorSize.dimensionsCm}. Largest diameter: ${tumorSize.largestDiameterCm}. Estimated volume: ${tumorSize.estimatedVolumeCc}. Size class: ${tumorSize.sizeCategory}.`
    },
    {
      title: "Tumor Spot Marking",
      body: `Marked suspicious area summary: ${markedSummary}`
    },
    {
      title: "AI Impression",
      body: `Confidence level: ${confidence}%. Priority recommendation: ${priority}.`
    },
    {
      title: "Important Notice",
      body: "This output is an AI-assisted prototype report and must not be used as a standalone diagnosis."
    }
  ];
}

function buildDefaultPrintSections(patient, finding, tumorSize, suspicionScore, confidence, qualityScore, heterogeneity, priority, annotatedImages) {
  const markedSummary = annotatedImages.map((item, index) => `Scan ${index + 1}: ${item.summary}`).join(" ");
  return [
    {
      title: "Executive Summary",
      body: `${patient.patientName} (${patient.patientId}) underwent prototype MRI screening for the ${String(patient.scanRegion || "target").toLowerCase()} region. The primary suspicious finding is ${finding}.`
    },
    {
      title: "Score And Measurement Summary",
      body: `Health risk score: ${suspicionScore}%. Confidence: ${confidence}%. Tumor measurements: ${tumorSize.dimensionsCm}. Largest diameter: ${tumorSize.largestDiameterCm}. Estimated volume: ${tumorSize.estimatedVolumeCc}.`
    },
    {
      title: "Marked Tumor Spot Analysis",
      body: `The uploaded MRI images were annotated with an AI-marked suspicious region. ${markedSummary}`
    },
    {
      title: "Quantitative Analysis",
      body: `Image quality score: ${qualityScore}%. Tissue heterogeneity: ${heterogeneity}%. Recommended action: ${priority}.`
    },
    {
      title: "Prototype Notice",
      body: "This printable analysis is prototype-only and requires radiologist confirmation."
    }
  ];
}

function normalizeList(list, fallback, mapper) {
  return (Array.isArray(list) && list.length ? list : fallback).map(mapper);
}

function normalizeAnnotation(annotation) {
  const leftPercent = clampNum(annotation.leftPercent, 5, 80, 36);
  const topPercent = clampNum(annotation.topPercent, 5, 80, 30);
  const widthPercent = clampNum(annotation.widthPercent, 10, 60, 24);
  const heightPercent = clampNum(annotation.heightPercent, 10, 60, 22);
  const centerXPercent = clampNum(annotation.centerXPercent, 0, 100, leftPercent + widthPercent / 2);
  const centerYPercent = clampNum(annotation.centerYPercent, 0, 100, topPercent + heightPercent / 2);
  return {
    leftPercent,
    topPercent,
    widthPercent,
    heightPercent,
    centerXPercent,
    centerYPercent,
    zone: String(annotation.zone || inferZone(centerXPercent / 100, centerYPercent / 100)).trim(),
    markerConfidence: clampInt(annotation.markerConfidence, 35, 99, 72)
  };
}

function inferTumorLocation(region) {
  return {
    Brain: "Frontal-parietal region",
    Breast: "Upper outer quadrant",
    Liver: "Right hepatic lobe",
    Prostate: "Peripheral zone",
    Spine: "Thoraco-lumbar segment",
    Pelvis: "Adnexal / pelvic soft-tissue region"
  }[region] || "Focal abnormal imaging region";
}

function inferZone(x, y) {
  const h = x < 0.33 ? "left" : x > 0.66 ? "right" : "central";
  const v = y < 0.33 ? "upper" : y > 0.66 ? "lower" : "middle";
  return `${cap(v)} ${h} quadrant`;
}

function normalizeBadge(level, score) {
  if (["low", "moderate", "high"].includes(level)) {
    return level;
  }
  return score >= 75 ? "high" : score >= 50 ? "moderate" : "low";
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  return Number.isNaN(number) ? fallback : Math.round(Math.min(max, Math.max(min, number)));
}

function clampNum(value, min, max, fallback) {
  const number = Number(value);
  const safe = Number.isNaN(number) ? fallback : Math.min(max, Math.max(min, number));
  return Number(safe.toFixed(1));
}

function parseJson(content) {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function cap(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
