/**
 * Seed KAP EXAM local D1 with realistic demo data via the HTTP API.
 * Usage: node scripts/seed.mjs [baseUrl]
 * Creates: teacher, ~8 topics / ~20 subtopics / ~150 questions, 3 batches / ~50 students.
 */
const BASE = process.argv[2] ?? "http://127.0.0.1:8787";

let token = "";
async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return parsed?.data ?? parsed;
}

const TOPICS = [
  { name: "Algebra", subs: ["Linear equations", "Quadratic equations", "Polynomials"] },
  { name: "Geometry", subs: ["Triangles", "Circles"] },
  { name: "Mechanics", subs: ["Motion", "Force & laws", "Work & energy"] },
  { name: "Chemistry", subs: ["Atomic structure", "Chemical bonding"] },
  { name: "Biology", subs: ["Cell biology", "Human body"] },
  { name: "Arithmetic", subs: ["Percentages", "Ratio & proportion", "Time & work"] },
  { name: "History", subs: ["Ancient India", "Freedom movement"] },
  { name: "English Grammar", subs: ["Tenses", "Voice & speech"] },
];

const FIRST = ["Rahul", "Priya", "Aarav", "Diya", "Arjun", "Sneha", "Vikram", "Ananya", "Karan", "Meera", "Rohan", "Ishita", "Aditya", "Kavya", "Nikhil", "Pooja", "Sahil", "Riya", "Manav", "Tanvi"];
const LAST = ["Sharma", "Nair", "Patel", "Gupta", "Singh", "Reddy", "Khan", "Iyer", "Das", "Kulkarni"];

function mcq(i, topic, sub) {
  const a = (i * 7 + 3) % 20 + 2;
  const b = a + 3;
  return {
    type: "mcq_single",
    prompt: `${sub} Q${i + 1}: If x + ${a} = ${a + b}, what is x? (${topic})`,
    options: [
      { id: "a", text: String(b - 1) },
      { id: "b", text: String(b) },
      { id: "c", text: String(b + 1) },
      { id: "d", text: String(b + 2) },
    ],
    correctOptionIds: ["b"],
    marks: 2,
    negativeMarks: 0.5,
  };
}
function multi(i, topic, sub) {
  return {
    type: "mcq_multi",
    prompt: `${sub} Q${i + 1}: Which of these are correct for ${topic}? (choose all that apply)`,
    options: [
      { id: "a", text: "Statement A holds" },
      { id: "b", text: "Statement B holds" },
      { id: "c", text: "Statement C is false" },
      { id: "d", text: "Statement D is false" },
    ],
    correctOptionIds: i % 2 === 0 ? ["a", "b"] : ["a", "b", "c"],
    marks: 3,
    negativeMarks: 1,
  };
}
function tf(i, topic, sub) {
  return {
    type: "true_false",
    prompt: `${sub} Q${i + 1}: ${topic} principle #${i + 1} always holds true.`,
    correctOptionIds: [i % 2 === 0 ? "true" : "false"],
    marks: 1,
    negativeMarks: 0,
  };
}
function num(i, topic, sub) {
  return {
    type: "numeric",
    prompt: `${sub} Q${i + 1}: Compute ${3 * (i + 1)} + ${i} for ${topic}.`,
    correctNumber: 3 * (i + 1) + i,
    numericTolerance: 0,
    marks: 2,
    negativeMarks: 0,
  };
}

async function main() {
  const email = `seed-${Date.now()}@kap.local`;
  const su = await api("POST", "/api/auth/signup", { name: "Seed Teacher", email, password: "password123" });
  token = su.token;
  console.log("teacher:", email);

  const subIds = [];
  for (const t of TOPICS) {
    const topic = await api("POST", "/api/topics", { name: t.name });
    for (const s of t.subs) {
      const sub = await api("POST", "/api/topics", { name: s, parentId: topic.id });
      subIds.push({ topic: t.name, sub: s, id: sub.id });
    }
  }
  console.log(`topics: ${TOPICS.length}, subtopics: ${subIds.length}`);

  let qCount = 0;
  const makers = [mcq, multi, tf, num];
  for (const { topic, sub, id } of subIds) {
    const n = 6 + (sub.length % 4); // 6-9 per subtopic
    for (let i = 0; i < n; i++) {
      const q = makers[(i + sub.length) % 4](i, topic, sub);
      await api("POST", "/api/questions", { subtopicId: id, ...q });
      qCount++;
    }
  }
  console.log(`questions: ${qCount}`);

  const batches = [];
  for (const name of ["2026 Sem 1 - A", "2026 Sem 1 - B", "2026 Sem 2 - A"]) {
    const b = await api("POST", "/api/batches", { name });
    batches.push(b);
  }
  let sCount = 0;
  for (let bi = 0; bi < batches.length; bi++) {
    const n = 16 + bi * 2;
    for (let i = 0; i < n; i++) {
      const fn = FIRST[(i * 3 + bi * 5) % FIRST.length];
      const ln = LAST[(i * 7 + bi * 3) % LAST.length];
      const roll = `R-${String(bi + 1).padStart(2, "0")}${String(i + 1).padStart(2, "0")}`;
      await api("POST", `/api/batches/${batches[bi].id}/students`, { name: `${fn} ${ln}`, rollNo: roll });
      sCount++;
    }
  }
  console.log(`batches: ${batches.length}, students: ${sCount}`);
  console.log("SEED_DONE", JSON.stringify({ email, batchIds: batches.map((b) => b.id) }));
}

main().catch((e) => {
  console.error("SEED_FAILED", e.message);
  process.exit(1);
});
