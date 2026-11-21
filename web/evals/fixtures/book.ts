// A small made-up textbook for the RAG evals. It has its own vocabulary (the
// Scales Method, the Scales Check, Twin Fractions, the Rate Table) so a test
// can tell whether a lesson was written from the book or from general
// knowledge.

export const BOOK_TITLE = "Stepping Stones Math, Grade 6";

// The section titles as printed, in order. The book map should find these.
export const BOOK_SECTION_TITLES = [
  "3.1 Twin Fractions",
  "3.2 Simplest Form",
  "3.3 Adding Fractions with Unlike Denominators",
  "4.1 The Scales Method",
  "4.2 Undoing Operations",
  "4.3 Two-Step Equations",
  "5.1 Ratios",
  "5.2 The Rate Table",
];

export const BOOK_TEXT = `Stepping Stones Math, Grade 6

Contents
Chapter 3 Fractions .......... 41
Chapter 4 Equations .......... 67
Chapter 5 Ratios and Rates .......... 93

Chapter 3 Fractions

3.1 Twin Fractions

Two fractions are Twin Fractions when they name the same amount even though they look different. Half a pizza is the same amount whether it is cut into 2 slices and you take 1, or cut into 8 slices and you take 4. So 1/2 and 4/8 are Twin Fractions.

To make a twin of a fraction, multiply the top number (the numerator) and the bottom number (the denominator) by the same number. Multiplying both by the same number is like cutting every slice into smaller equal slices: the number of slices changes, the amount of pizza does not.

Worked example: find a twin of 2/3 with denominator 12. Ask what 3 was multiplied by to get 12. It was multiplied by 4, so multiply the numerator by 4 as well: 2 x 4 = 8. The twin is 8/12.

Check yourself: 3/5 and 9/15 are twins because both numbers were multiplied by 3. But 3/5 and 6/15 are not twins, because the numerator was multiplied by 2 and the denominator by 3.

3.2 Simplest Form

A fraction is in Simplest Form when no whole number other than 1 divides both its numerator and its denominator. Simplest Form is the smallest twin of a fraction, and answers in this book are always given in Simplest Form.

To reach Simplest Form, divide the numerator and the denominator by their greatest common factor, the GCF. The GCF is the largest number that divides both.

Worked example: write 18/24 in Simplest Form. The factors of 18 are 1, 2, 3, 6, 9 and 18. The factors of 24 are 1, 2, 3, 4, 6, 8, 12 and 24. The GCF is 6. Divide both numbers by 6: 18 / 6 = 3 and 24 / 6 = 4. So 18/24 = 3/4.

A common slip is to stop too early. Dividing 18/24 by 2 gives 9/12, which is a twin but not Simplest Form, because 3 still divides both numbers. If you divide by a factor that is not the greatest one, keep dividing until only 1 is left as a common factor.

3.3 Adding Fractions with Unlike Denominators

You can add fractions only when the slices are the same size, that is, when the denominators match. Fractions with different denominators must first be swapped for Twin Fractions that share a denominator. This book calls that shared denominator the Common Ground.

The quickest Common Ground is the least common multiple of the two denominators. Never add the denominators: 1/2 + 1/3 is not 2/5. Two fifths is less than a half, so it cannot be the total of a half and something more.

Worked example: 1/2 + 1/3. The least common multiple of 2 and 3 is 6, so the Common Ground is 6. The twin of 1/2 with denominator 6 is 3/6. The twin of 1/3 with denominator 6 is 2/6. Now add the numerators and keep the denominator: 3/6 + 2/6 = 5/6. Finish by checking that the answer is in Simplest Form.

Chapter 4 Equations

4.1 The Scales Method

An equation says that two amounts are equal. In this book we solve every equation with the Scales Method. Picture the equation as a pair of old-fashioned scales: the left pan holds the left side, the right pan holds the right side, and the equals sign is the pivot in the middle.

The scales stay level only if we treat both pans the same way. This is the Golden Rule of the Scales Method: whatever you do to one pan, do to the other. Add 5 to the left pan and you must add 5 to the right pan. Halve the left pan and you must halve the right pan.

A letter such as x stands for a weight we do not know yet. Solving the equation means finding that weight. For x + 3 = 10, imagine a bag marked x and 3 one-pound weights in the left pan, balancing 10 one-pound weights in the right pan. Take 3 weights off each pan and the bag balances 7 weights, so x = 7.

4.2 Undoing Operations

Every operation has an opposite that undoes it. Addition and subtraction undo each other. Multiplication and division undo each other. To get the unknown by itself on one pan, undo whatever has been done to it, and follow the Golden Rule by doing the same to the other pan.

Worked example: x - 6 = 9. Six has been subtracted from x, so undo it by adding 6 to both pans: x = 15.

Worked example: 4x = 28. Here x has been multiplied by 4, so undo it by dividing both pans by 4: x = 7.

Always finish with a Scales Check. Put your answer back into the original equation and see whether the pans balance. For 4x = 28 with x = 7: 4 x 7 = 28, and 28 = 28, so the scales are level and the answer is right. If the two sides are different, go back and look for the step where the pans were treated differently.

4.3 Two-Step Equations

In a two-step equation two things have been done to the unknown, for example multiplied by 3 and then 4 added: 3x + 4 = 19. Undo the operations in reverse order, like taking off shoes before socks. The last thing done was the addition, so undo that first.

Worked example: 3x + 4 = 19. Step 1: take 4 from both pans, which leaves 3x = 15. Step 2: share both pans into 3 equal parts, which leaves x = 5. Scales Check: 3 x 5 + 4 = 19, and 19 = 19, so the scales are level.

A common slip is to divide first and forget to divide every weight in the pan. If you divide 3x + 4 = 19 by 3 straight away, the 4 must be divided by 3 as well, which gives awkward fractions. Undoing the addition first keeps the numbers whole.

Chapter 5 Ratios and Rates

5.1 Ratios

A ratio compares two amounts by saying how much of one there is for a given amount of the other. If a fruit punch recipe uses 2 cups of juice for every 3 cups of soda water, the ratio of juice to soda water is 2 to 3, written 2:3. Order matters: the ratio of soda water to juice is 3:2.

Ratios can be scaled just like Twin Fractions. Multiply or divide both parts by the same number and the mixture tastes the same. The ratio 2:3 is the same mixture as 4:6 or 20:30. A ratio is in Simplest Form when its two parts have no common factor other than 1.

Worked example: a class has 12 girls and 18 boys. The ratio of girls to boys is 12:18. The GCF of 12 and 18 is 6, so divide both parts by 6: the ratio in Simplest Form is 2:3.

5.2 The Rate Table

A rate is a ratio that compares two different kinds of unit, such as miles and hours or dollars and pounds. A unit rate tells you how much for 1: miles in 1 hour, dollars for 1 pound.

This book organizes every rate problem in a Rate Table. The table has two rows, one for each unit, and you fill in a new column by multiplying or dividing both rows by the same number.

Worked example: a car travels 150 miles in 3 hours. How far does it travel in 5 hours at the same speed? Start the Rate Table with the column 150 miles, 3 hours. Divide both rows by 3 to get the unit rate column: 50 miles, 1 hour. Multiply both rows by 5 to get the column you need: 250 miles, 5 hours. The car travels 250 miles.

Always build the unit rate column first. Going through "how much for 1" turns a hard jump, such as from 3 hours to 5 hours, into two easy ones.
`;

// For each query (a lesson's title and objective, which is what the backend
// embeds) the section title its excerpts should come from.
export const RETRIEVAL_QUERIES: { query: string; section: string }[] = [
  { query: "Equivalent fractions. Find a fraction equal to a given one with a different denominator.", section: "3.1 Twin Fractions" },
  { query: "Making fractions that name the same amount by multiplying top and bottom.", section: "3.1 Twin Fractions" },
  { query: "Reducing fractions. Write a fraction in lowest terms using the greatest common factor.", section: "3.2 Simplest Form" },
  { query: "Why dividing by 2 once is not always enough when simplifying a fraction.", section: "3.2 Simplest Form" },
  { query: "Adding fractions. Add two fractions that have different denominators.", section: "3.3 Adding Fractions with Unlike Denominators" },
  { query: "Why you cannot add the denominators when adding one half and one third.", section: "3.3 Adding Fractions with Unlike Denominators" },
  { query: "What an equation is. Explain an equation as a balance and what the unknown stands for.", section: "4.1 The Scales Method" },
  { query: "Keeping an equation balanced by doing the same thing to both sides.", section: "4.1 The Scales Method" },
  { query: "One-step equations. Solve x - a = b and ax = b using inverse operations.", section: "4.2 Undoing Operations" },
  { query: "Checking a solution by substituting it back into the equation.", section: "4.2 Undoing Operations" },
  { query: "Solving equations of the form ax + b = c.", section: "4.3 Two-Step Equations" },
  { query: "In what order to undo multiplication and addition when solving for x.", section: "4.3 Two-Step Equations" },
  { query: "Introduction to ratios. Write and simplify a ratio comparing two quantities.", section: "5.1 Ratios" },
  { query: "Comparing the number of girls and boys in a class.", section: "5.1 Ratios" },
  { query: "Unit rates. Find how far a car goes in a given time at constant speed.", section: "5.2 The Rate Table" },
  { query: "Solving rate problems with miles and hours or dollars and pounds.", section: "5.2 The Rate Table" },
];
