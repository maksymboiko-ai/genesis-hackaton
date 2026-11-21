// Two more made-up textbooks for the book-map eval. The fixture in book.ts is
// short and tidy; these cover what a real upload adds: length, and a book
// with no chapters and with back matter that is not a section.

export type MapBook = {
  title: string;
  text: string;
  // Section headings as printed, in order. The book map should find these.
  sectionTitles: string[];
};

// --- A long book -------------------------------------------------------------
// 12 chapters of 5 sections, about 150 chunks: the size at which a model
// starts dropping sections or losing its place in the chunk numbers.

const LONG_BOOK_CHAPTERS: [string, string[]][] = [
  ["Whole Numbers", ["Place Value to Millions", "Rounding Whole Numbers", "Adding Large Numbers", "Subtracting Across Zeros", "Estimating Sums and Differences"]],
  ["Multiplication", ["Multiplying by One Digit", "Multiplying by Two Digits", "The Area Model", "Multiplication Word Problems", "Powers of Ten"]],
  ["Division", ["Dividing with Remainders", "Long Division", "Checking Division with Multiplication", "Division Word Problems", "Divisibility Rules"]],
  ["Factors and Multiples", ["Finding Factors", "Prime and Composite Numbers", "Prime Factorization", "Greatest Common Factor", "Least Common Multiple"]],
  ["Fractions", ["Equivalent Fractions", "Comparing Fractions", "Mixed Numbers", "Adding Unlike Fractions", "Subtracting Unlike Fractions"]],
  ["Decimals", ["Decimal Place Value", "Comparing Decimals", "Adding and Subtracting Decimals", "Multiplying Decimals", "Dividing Decimals"]],
  ["Percents", ["Percent as a Rate per Hundred", "Fractions to Percents", "Percent of a Number", "Discounts and Sales Tax", "Percent Change"]],
  ["Integers", ["Numbers Below Zero", "Ordering Integers", "Adding Integers", "Subtracting Integers", "Absolute Value"]],
  ["Expressions", ["Variables and Terms", "Writing Expressions", "Evaluating Expressions", "Combining Like Terms", "The Distributive Property"]],
  ["Geometry", ["Classifying Angles", "Triangles and Their Angles", "Perimeter of Polygons", "Area of Triangles", "Volume of Rectangular Prisms"]],
  ["Measurement", ["Customary Units of Length", "Metric Units of Mass", "Converting Units", "Elapsed Time", "Reading Scales and Gauges"]],
  ["Data and Probability", ["Mean and Median", "Reading Bar Graphs", "Line Plots", "Simple Probability", "Counting Outcomes"]],
];

function longSectionBody(topic: string, chapter: string): string {
  const name = topic.toLowerCase();
  return [
    `This section is about ${name}. You have met parts of this idea in earlier grades, and here it is put together as one method you can use every time. Read the explanation slowly, then follow the worked example with a pencil in your hand. By the end you should be able to explain ${name} to a classmate in your own words, not only get the right answer.`,
    `Why ${name} matters: people use it at the store, in the kitchen and at work, usually without naming it. In the chapter on ${chapter.toLowerCase()} it is one of the ideas everything else leans on, so time spent here is repaid in the sections that follow. If a later page feels hard, come back and reread this one first.`,
    `The method for ${name} has three steps. First, write down what you are given and what you are asked to find. Second, choose the rule from this section that connects the two, and say out loud why it fits. Third, carry out the rule one line at a time, keeping your columns straight so a slip is easy to spot.`,
    `Worked example for ${name}: start from the numbers in the question and write them one under the other. Work through the three steps above and write each result on a new line. When you reach an answer, do not stop: estimate what the answer should be close to, and compare. If the two are far apart, look for the slip in the line where the numbers first disagree.`,
    `A common mistake with ${name} is to rush the first step and answer a different question from the one that was asked. Another is to copy a number wrongly from one line to the next. Both are cured the same way: slow down, read the question twice, and check each line against the one above it before going on.`,
    `Practice for ${name}: try the six exercises below on your own paper. The first two are like the worked example. The next two change one thing, so read them carefully. The last two are word problems, where you must decide for yourself that ${name} is the tool to use. Answers to the odd-numbered exercises are at the back of the book.`,
  ].join("\n\n");
}

function buildLongBook(): MapBook {
  const sectionTitles: string[] = [];
  const parts = [
    "Bridges Math, Grade 5",
    [
      "Contents",
      ...LONG_BOOK_CHAPTERS.map(
        ([chapter], index) => `Chapter ${index + 1} ${chapter} .......... ${3 + index * 24}`,
      ),
    ].join("\n"),
  ];
  LONG_BOOK_CHAPTERS.forEach(([chapter, topics], chapterIndex) => {
    parts.push(`Chapter ${chapterIndex + 1} ${chapter}`);
    topics.forEach((topic, topicIndex) => {
      const heading = `${chapterIndex + 1}.${topicIndex + 1} ${topic}`;
      sectionTitles.push(heading);
      parts.push(heading, longSectionBody(topic, chapter));
    });
  });
  parts.push(
    "Answers to odd-numbered exercises\n" +
      sectionTitles.map((title) => `${title.split(" ")[0]}: 1) 24  3) 108  5) 7 remainder 2`).join("\n"),
  );
  return { title: "Bridges Math, Grade 5", text: parts.join("\n\n"), sectionTitles };
}

export const LONG_BOOK = buildLongBook();

// --- A book with no chapters ---------------------------------------------------
// Six lessons under plain "Lesson N" headings, then a glossary and an answer
// key. The map should have six sections, each with chapter "", and nothing
// for the contents page or the back matter.

const PLAIN_BOOK_LESSONS: [string, string][] = [
  [
    "The Water Cycle",
    "Water on Earth is never used up. It moves in a loop called the water cycle. The Sun warms the water in oceans, lakes and puddles, and some of it turns into an invisible gas called water vapor. This change from liquid to gas is evaporation.\n\nHigh in the sky the air is cold. The water vapor cools and turns back into tiny drops of liquid water. This change is condensation, and the drops gather into clouds. When the drops grow too heavy to float, they fall as rain, snow or hail. Falling water is called precipitation.\n\nTry it: put a lid on a warm cup of water and wait five minutes. The drops under the lid show evaporation followed by condensation.",
  ],
  [
    "Clouds and Rain",
    "Not every cloud brings rain. Thin, feathery clouds high in the sky are cirrus clouds, and they usually mean fair weather. Puffy white clouds with flat bottoms are cumulus clouds. Low gray sheets that cover the whole sky are stratus clouds, and they often bring drizzle.\n\nRain falls when the drops inside a cloud bump together and join until they are heavy. A tall, dark cumulus cloud is called a cumulonimbus cloud. It can bring heavy rain, thunder and lightning.\n\nTry it: draw the sky at the same time each day for a week. Label each cloud type and write down whether it rained.",
  ],
  [
    "Rivers and Lakes",
    "Rain that lands on the ground runs downhill. Small trickles join to make streams, and streams join to make rivers. The place where a river begins is its source, and the place where it ends, usually the sea, is its mouth.\n\nA lake forms where water collects in a low place and cannot easily run out. Most lakes hold fresh water, which has very little salt. People, animals and plants all depend on fresh water from rivers and lakes.\n\nTry it: pour a cup of water slowly onto a pile of sand outdoors. Watch how the water cuts a channel, just as a river does.",
  ],
  [
    "Water Underground",
    "Some rain soaks into the soil instead of running off. It sinks through sand and gravel until it reaches rock that it cannot pass through. Water stored below the ground is called groundwater.\n\nA well is a hole dug or drilled down to the groundwater. Many towns get their drinking water from wells. In a long dry spell the groundwater sinks lower, and a shallow well can run dry.\n\nTry it: fill a clear jar with gravel and pour in water until it is half full. The line where the wet gravel stops is like the top of the groundwater.",
  ],
  [
    "Ice and Snow",
    "When water gets colder than 32 degrees Fahrenheit it freezes into ice. Water is unusual: it takes up more room as ice than as liquid. That is why a full bottle can crack in the freezer and why ice floats.\n\nSnow is made of tiny ice crystals that form in cold clouds. In very cold places snow piles up year after year and is pressed into thick ice called a glacier. Glaciers move slowly downhill and carve out valleys.\n\nTry it: mark the water level on a plastic cup, freeze it overnight, and compare the level of the ice with your mark.",
  ],
  [
    "Saving Water",
    "Only a small part of the water on Earth is fresh water that people can use. Using less of it is called water conservation. Small habits add up: turning off the faucet while brushing your teeth saves several gallons a day.\n\nA dripping faucet can waste more than a thousand gallons in a year. Fixing leaks, taking shorter showers and watering plants in the cool of the morning all save water.\n\nTry it: put a measuring cup under a dripping faucet for ten minutes. Work out how much water would be lost in a whole day.",
  ],
];

function buildPlainBook(): MapBook {
  const sectionTitles = PLAIN_BOOK_LESSONS.map(([topic], index) => `Lesson ${index + 1} ${topic}`);
  const text = [
    "Our Wet Planet\nA third grade science reader",
    ["In this book", ...PLAIN_BOOK_LESSONS.map(([topic], index) => `${topic}, page ${4 + index * 6}`)].join("\n"),
    ...PLAIN_BOOK_LESSONS.flatMap(([, body], index) => [sectionTitles[index], body]),
    "Glossary\ncondensation: the change from a gas to a liquid\nevaporation: the change from a liquid to a gas\nglacier: a thick body of ice that moves slowly downhill\ngroundwater: water stored below the ground\nprecipitation: water that falls from clouds as rain, snow or hail\nwater vapor: water in the form of an invisible gas",
    "Answer Key\nThe Water Cycle: the drops under the lid are condensation.\nIce and Snow: the ice stands higher than the mark, because water takes up more room as ice.\nSaving Water: multiply the ten-minute amount by 144.",
  ].join("\n\n");
  return { title: "Our Wet Planet", text, sectionTitles };
}

export const PLAIN_BOOK = buildPlainBook();
