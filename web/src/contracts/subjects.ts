// The subjects of each grade (US school year), shared by the frontend, the
// backend and the AI module. A curriculum's subject is always one of its
// child's grade subjects, by this exact name, so lessons, plans, mastery and
// progress use the same name the child sees at school.
//
// family groups subjects for colour and icon; the first POPULAR_PER_GRADE
// subjects of a grade are its core ones, shown first and on the first-plan
// screen.

export type SubjectFamily = "read" | "math" | "sci" | "social" | "arts" | "move" | "lang" | "tech";

export type GradeSubject = {
  name: string;
  family: SubjectFamily;
  // A few words on what the subject covers at this grade.
  blurb: string;
};

export const POPULAR_PER_GRADE = 3;

const s = (name: string, family: SubjectFamily, blurb: string): GradeSubject => ({ name, family, blurb });

export const GRADE_SUBJECTS: Record<number, GradeSubject[]> = {
  1: [
    s("English Language Arts", "read", "Phonics, sight words, first stories"),
    s("Mathematics", "math", "Counting, adding and taking away"),
    s("Science", "sci", "Animals, plants, the five senses"),
    s("Social Studies", "social", "Family, school and community"),
    s("Art", "arts", "Colors, shapes, drawing"),
    s("Music", "arts", "Beat, rhythm, singing"),
    s("Physical Education", "move", "Running, jumping, playing fair"),
  ],
  2: [
    s("English Language Arts", "read", "Reading fluency, spelling, sentences"),
    s("Mathematics", "math", "Two-digit numbers, money, time"),
    s("Science", "sci", "Life cycles, matter, weather"),
    s("Social Studies", "social", "Maps, neighborhoods, citizenship"),
    s("Art", "arts", "Patterns, texture, painting"),
    s("Music", "arts", "Tempo, high and low notes"),
    s("Physical Education", "move", "Throwing, catching, team games"),
  ],
  3: [
    s("English Language Arts", "read", "Phonics, reading, spelling"),
    s("Mathematics", "math", "Times tables, fractions, time"),
    s("Science", "sci", "Plants, weather, magnets"),
    s("Social Studies", "social", "Communities, maps, holidays"),
    s("Art", "arts", "Drawing, color, shapes"),
    s("Music", "arts", "Rhythm, notes, singing"),
    s("Physical Education", "move", "Movement, games, teamwork"),
  ],
  4: [
    s("English Language Arts", "read", "Main idea, paragraphs, vocabulary"),
    s("Mathematics", "math", "Long multiplication, fractions, area"),
    s("Science", "sci", "Energy, rocks, ecosystems"),
    s("Social Studies", "social", "State history, regions, government"),
    s("Art", "arts", "Perspective, mixing color"),
    s("Music", "arts", "Reading notes, instruments"),
    s("Physical Education", "move", "Fitness, sports skills"),
  ],
  5: [
    s("English Language Arts", "read", "Novels, essays, grammar"),
    s("Mathematics", "math", "Decimals, fractions, volume"),
    s("Science", "sci", "Matter, Earth and space, food webs"),
    s("Social Studies", "social", "Early America, the Constitution"),
    s("Art", "arts", "Sketching, art history"),
    s("Music", "arts", "Melody, harmony, ensembles"),
    s("Physical Education", "move", "Endurance, sportsmanship"),
  ],
  6: [
    s("English Language Arts", "read", "Literature, argument writing"),
    s("Mathematics", "math", "Ratios, negative numbers, equations"),
    s("Earth Science", "sci", "Plate tectonics, weather, the solar system"),
    s("World Geography", "social", "Continents, cultures, climates"),
    s("World Language", "lang", "Greetings, numbers, everyday phrases"),
    s("Art", "arts", "Drawing, design, color theory"),
    s("Music", "arts", "Notation, rhythm, ensembles"),
    s("Physical Education and Health", "move", "Fitness, nutrition, wellbeing"),
  ],
  7: [
    s("English Language Arts", "read", "Themes, research, persuasive essays"),
    s("Mathematics", "math", "Proportions, integers, expressions"),
    s("Life Science", "sci", "Cells, genetics, ecosystems"),
    s("World History", "social", "Ancient and medieval civilizations"),
    s("World Language", "lang", "Present tense, family, school life"),
    s("Art", "arts", "Painting, printmaking, critique"),
    s("Music", "arts", "Theory, performance, listening"),
    s("Physical Education and Health", "move", "Team sports, health choices"),
  ],
  8: [
    s("English Language Arts", "read", "Analysis, narrative, grammar"),
    s("Pre-Algebra", "math", "Linear equations, exponents, functions"),
    s("Physical Science", "sci", "Forces, motion, chemistry basics"),
    s("U.S. History", "social", "Colonies to Reconstruction"),
    s("World Language", "lang", "Past tense, travel, conversation"),
    s("Art", "arts", "Drawing from life, digital art"),
    s("Music", "arts", "Composition, ensembles"),
    s("Physical Education and Health", "move", "Fitness planning, wellbeing"),
  ],
  9: [
    s("English I", "read", "Literary analysis, essays, grammar"),
    s("Algebra I", "math", "Equations, inequalities, functions"),
    s("Biology", "sci", "Cells, genetics, evolution"),
    s("World History", "social", "Empires, revolutions, world wars"),
    s("World Language", "lang", "Grammar, reading, conversation"),
    s("Physical Education and Health", "move", "Fitness, health, decision-making"),
    s("Introduction to Computer Science", "tech", "Programming basics, problem solving"),
  ],
  10: [
    s("English II", "read", "World literature, argument, rhetoric"),
    s("Geometry", "math", "Proofs, triangles, circles"),
    s("Chemistry", "sci", "Atoms, reactions, stoichiometry"),
    s("U.S. History", "social", "Reconstruction to today"),
    s("World Language", "lang", "Tenses, reading, writing"),
    s("Physical Education", "move", "Lifetime fitness, sports"),
    s("Studio Art", "arts", "Portfolio, media, technique"),
  ],
  11: [
    s("English III", "read", "American literature, research writing"),
    s("Algebra II", "math", "Polynomials, logarithms, functions"),
    s("Physics", "sci", "Motion, forces, energy, waves"),
    s("U.S. Government and Civics", "social", "The Constitution, rights, elections"),
    s("World Language", "lang", "Advanced grammar, culture, essays"),
    s("Psychology", "sci", "Behavior, memory, development"),
  ],
  12: [
    s("English IV", "read", "British literature, research essays"),
    s("Precalculus", "math", "Functions, trigonometry, limits"),
    s("Environmental Science", "sci", "Ecosystems, climate, resources"),
    s("Economics", "social", "Supply and demand, markets, money"),
    s("Computer Science", "tech", "Algorithms, programming, data"),
    s("Creative Writing", "arts", "Short stories, poetry, voice"),
  ],
};

const clampGrade = (grade: number) => Math.min(12, Math.max(1, Math.round(grade) || 1));

/** Every subject of a grade, core ones first. */
export function subjectsForGrade(grade: number): GradeSubject[] {
  return GRADE_SUBJECTS[clampGrade(grade)];
}

/** The grade's core subjects, for the first-plan screen. */
export function popularSubjects(grade: number): GradeSubject[] {
  return subjectsForGrade(grade).slice(0, POPULAR_PER_GRADE);
}

const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The grade subject with this name (any case and punctuation), else null. */
export function findGradeSubject(grade: number, name: string): GradeSubject | null {
  const key = norm(name);
  return subjectsForGrade(grade).find((subject) => norm(subject.name) === key) ?? null;
}

// Checked in this order: "physical education" must not read as science,
// "computer science" as science, or "creative writing" as English.
const FAMILY_HINTS: [SubjectFamily, RegExp][] = [
  ["move", /physical education|\bpe\b|health|sport|fitness/],
  ["tech", /computer|coding|programming/],
  ["arts", /\bart\b|music|drawing|paint|creative|studio/],
  ["read", /english|reading|writing|literat|grammar|phonics|spell|vocab|essay|poe/],
  ["lang", /language|spanish|french|german|chinese|latin/],
  ["math", /math|algebra|geometr|calcul|arithmet|fraction|number|statistic|trigon/],
  ["sci", /scien|biolog|chemi|physic|earth|life|environment|ecolog|psycholog|anatomy|astronom/],
  ["social", /social|histor|geograph|civic|govern|econom/],
];

/** The family of any subject name: a known name first, then by its words. */
export function subjectFamily(name: string): SubjectFamily {
  const key = norm(name);
  for (const grade of Object.values(GRADE_SUBJECTS)) {
    const hit = grade.find((subject) => norm(subject.name) === key);
    if (hit) return hit.family;
  }
  for (const [family, hint] of FAMILY_HINTS) if (hint.test(key)) return family;
  return "math";
}

/**
 * Maps any subject name onto the grade's list: the same name, else the
 * grade's subject of the same family, else the grade's first subject.
 */
export function gradeSubjectFor(grade: number, name: string): GradeSubject {
  const exact = findGradeSubject(grade, name);
  if (exact) return exact;
  const family = subjectFamily(name);
  const subjects = subjectsForGrade(grade);
  return subjects.find((subject) => subject.family === family) ?? subjects[0];
}
