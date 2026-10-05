/**
 * End-to-end API regression: auth -> bank -> batch+roster -> exam ->
 * compose -> publish -> roll-only join -> answer -> submit -> reports.
 * Usage: node scripts/e2e.mjs [baseUrl]   (expects a local wrangler dev server)
 * Exits non-zero on the first failed assertion.
 */
const BASE = process.argv[2] ?? "http://127.0.0.1:8787";

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`ok   ${name}`);
  else {
    failures++;
    console.error(`FAIL ${name} ${extra}`);
  }
}

let token = "";
async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const stamp = Date.now();
const email = `e2e-${stamp}@kap.local`;

// auth
{
  const r = await api("POST", "/api/auth/signup", { name: "E2E Teacher", email, password: "password123" });
  check("signup 201", r.status === 201);
  token = r.body.data.token;
  check("bearer token issued", typeof token === "string" && token.length > 10);
  const me = await api("GET", "/api/auth/me");
  check("me 200", me.status === 200 && me.body.data.email === email);
}

// bank
let subId;
{
  const t = await api("POST", "/api/topics", { name: `E2E Topic ${stamp}` });
  check("topic created", t.status === 201);
  const s = await api("POST", "/api/topics", { name: "E2E Sub", parentId: t.body.data.id });
  check("subtopic created", s.status === 201);
  subId = s.body.data.id;
  const bad = await api("POST", "/api/questions", {
    subtopicId: subId, type: "mcq_single", prompt: "bad", options: [{ id: "a", text: "1" }], correctOptionIds: ["a"],
  });
  check("invalid question rejected (400)", bad.status === 400);
  const q = await api("POST", "/api/questions", {
    subtopicId: subId, type: "mcq_single", prompt: "E2E: 2+2?", marks: 4,
    options: [{ id: "a", text: "3" }, { id: "b", text: "4" }, { id: "c", text: "5" }, { id: "d", text: "6" }],
    correctOptionIds: ["b"],
  });
  check("question created", q.status === 201 && q.body.data.correctOptionIds[0] === "b");
  const n = await api("POST", "/api/questions", {
    subtopicId: subId, type: "numeric", prompt: "E2E: 6*7?", marks: 6, correctNumber: 42, numericTolerance: 0,
  });
  check("numeric created", n.status === 201);
  const counts = await api("GET", "/api/topics/counts");
  check("counts include subtopic", counts.body.data.bySubtopic[subId] === 2);
}

// batch + roster
let batchId;
{
  const b = await api("POST", "/api/batches", { name: `E2E Batch ${stamp}` });
  check("batch created", b.status === 201);
  batchId = b.body.data.id;
  await api("POST", `/api/batches/${batchId}/students`, { name: "E2E Ana", rollNo: "E2E-01" });
  // messy duplicate must resolve to the same person
  await api("POST", `/api/batches/${batchId}/students`, { name: "E2E Ana", rollNo: "e2e 01" });
  const roster = await api("GET", `/api/batches/${batchId}/students?limit=10`);
  check("roll normalization dedupes (1 student)", roster.body.data.total === 1 && roster.body.data.items.length === 1);
  const detail = await api("GET", `/api/batches/${batchId}`);
  check("batch detail reports headcount only", detail.body.data.studentCount === 1 && !detail.body.data.roster);
}

// exam lifecycle
let exam, joinCode;
{
  const start = new Date(Date.now() - 60_000).toISOString();
  const end = new Date(Date.now() + 3_600_000).toISOString();
  const e = await api("POST", "/api/exams", {
    batchId, title: "E2E Exam", schedule: { startsAt: start, endsAt: end, durationMinutes: 30 },
  });
  check("exam created", e.status === 201);
  exam = e.body.data;
  joinCode = exam.joinCode;
  const comp = await api("POST", `/api/exams/${exam.id}/compose`, {
    sources: [{ kind: "subtopic", subtopicId: subId }],
  });
  check("composed 2 questions", comp.body.data.questionCount === 2);
  const pub = await api("POST", `/api/exams/${exam.id}/publish`, {});
  check("published", pub.body.data.status === "published");
  const edit = await api("PATCH", `/api/exams/${exam.id}`, { title: "hacked" });
  check("published exam immutable (400)", edit.status === 400);
}

// roll-only join -> answer -> submit
let attemptId;
{
  const unknown = await api("POST", "/api/attempts/lookup", { joinCode, rollNo: "NOPE-99" });
  check("unknown roll rejected", unknown.status === 404);
  const lookup = await api("POST", "/api/attempts/lookup", { joinCode, rollNo: "e2e-01" });
  check("roll-only lookup resolves name", lookup.status === 200 && lookup.body.data.name === "E2E Ana");
  const join = await api("POST", "/api/attempts/join", { joinCode, rollNo: "E2E-01", deviceToken: "e2e-device" });
  check("join 200 with sanitized paper", join.status === 200 && join.body.data.paper.length === 2);
  const leaked = JSON.stringify(join.body.data.paper).includes("correctOptionIds");
  check("paper leaks no answers", !leaked);
  attemptId = join.body.data.attemptId;
  const paper = join.body.data.paper;
  for (const q of paper) {
    if (q.type === "numeric") {
      await api("POST", "/api/attempts/answer", { attemptId, questionId: q.id, selectedOptionIds: [], numericValue: 42 });
    } else {
      await api("POST", "/api/attempts/answer", { attemptId, questionId: q.id, selectedOptionIds: ["b"], numericValue: null });
    }
  }
  const sub = await api("POST", "/api/attempts/submit", { attemptId });
  check("submit scores 10/10", sub.body.data.score === 10 && sub.body.data.maxScore === 10);
  const rejoin = await api("POST", "/api/attempts/join", { joinCode, rollNo: "E2E-01", deviceToken: "e2e-device" });
  check("rejoin after submit is 409 with attemptId", rejoin.status === 409 && rejoin.body.error.fields?.attemptId?.[0] === attemptId);
  const prev = await api("GET", `/api/attempts/${attemptId}`);
  check("result fetch shows breakdown", prev.body.data.result?.score === 10);
}

// reports + pagination envelope
{
  const examRep = await api("GET", `/api/reports/exams/${exam.id}`);
  const ana = examRep.body.data.results.find((r) => r.rollNo === "E2E-01");
  check("exam report has Ana 10/10", ana?.score === 10);
  check("exam report summary covers the cohort", examRep.body.data.summary?.appeared === 1);
  const studentId = ana.studentId;
  const stuRep = await api("GET", `/api/reports/students/${studentId}`);
  check("student report totals 10/10", stuRep.body.data.totals.score === 10 && stuRep.body.data.examsTaken === 1);

  // every list answers with the same page envelope
  const examsPage = await api("GET", "/api/exams?limit=1&offset=0");
  check(
    "exams list is paged",
    examsPage.body.data.items.length === 1 &&
      examsPage.body.data.total >= 1 &&
      typeof examsPage.body.data.hasMore === "boolean",
  );
  const questionsPage = await api("GET", `/api/questions?subtopicId=${subId}&limit=1`);
  check(
    "questions list pages the subtopic pool",
    questionsPage.body.data.items.length === 1 && questionsPage.body.data.total === 2,
  );
  const rosterPage = await api("GET", `/api/batches/${batchId}/students?limit=1&offset=1`);
  check("roster offset past the end is empty", rosterPage.body.data.items.length === 0 && rosterPage.body.data.total === 1);
  const reportPage = await api("GET", `/api/reports/exams/${exam.id}?limit=1&offset=0`);
  check("report roster pages without losing the summary", reportPage.body.data.results.length === 1 && reportPage.body.data.summary?.totalStudents === 1);
}

// batch delete
{
  const del = await api("DELETE", `/api/batches/${batchId}`);
  check("batch deleted", del.body.data.deleted === true);
}

if (failures > 0) {
  console.error(`${failures} FAILURE(S)`);
  process.exit(1);
}
console.log("E2E PASS");
