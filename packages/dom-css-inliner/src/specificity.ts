export type Specificity = {
  A: number; // ID selectors
  B: number; // class, attribute, pseudo-class selectors
  C: number; // element and pseudo-element selectors
};

export function compareSpecificity(specA: Specificity, specB: Specificity): number {
  return (specA.A - specB.A) || (specA.B - specB.B) || (specA.C - specB.C);
}

export function calculateSpecificity(selector: string): Specificity {
  const specificity: Specificity = { A: 0, B: 0, C: 0 };
  let selectorToParse = selector;

  // 1) Peel off all nested :is(), :has(), :not(), :where()
  //    by finding the earliest one, extracting its balanced content,
  //    recursing on each comma-separated sub-selector, and removing it
  const logicalPseudos = [":is", ":has", ":not", ":where"];
  while (true) {
    let matchIndex = -1;
    let whichPseudo = "";
    // find the earliest occurrence of any of our logical pseudos
    for (const pseudo of logicalPseudos) {
      const idx = selectorToParse.indexOf(pseudo + "(");
      if (idx !== -1 && (matchIndex === -1 || idx < matchIndex)) {
        matchIndex = idx;
        whichPseudo = pseudo;
      }
    }
    if (matchIndex === -1) break;

    // find the matching closing ')' by counting depth
    const openParen = selectorToParse.indexOf("(", matchIndex);
    let depth = 1;
    let closeParen = openParen;
    for (let i = openParen + 1; i < selectorToParse.length; i++) {
      const ch = selectorToParse[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      if (depth === 0) {
        closeParen = i;
        break;
      }
    }

    // extract the inside of the pseudo
    const inner = selectorToParse.slice(openParen + 1, closeParen);

    // remove the entire pseudo-class from the working string
    selectorToParse =
      selectorToParse.slice(0, matchIndex) +
      selectorToParse.slice(closeParen + 1);

    // :where() adds zero specificity
    if (whichPseudo === ":where") {
      continue;
    }

    // split on top-level commas only
    const args: string[] = [];
    let last = 0;
    depth = 0;
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === "," && depth === 0) {
        args.push(inner.slice(last, i).trim());
        last = i + 1;
      }
    }
    args.push(inner.slice(last).trim());

    // pick the MOST specific of the arguments
    let best: Specificity = { A: 0, B: 0, C: 0 };
    for (const arg of args) {
      const sp = calculateSpecificity(arg);
      if (compareSpecificity(sp, best) > 0) best = sp;
    }
    specificity.A += best.A;
    specificity.B += best.B;
    specificity.C += best.C;
  }

  // 2) Count IDs
  specificity.A += (selectorToParse.match(/#[\w\d_-]+/g) || []).length;
  selectorToParse = selectorToParse.replace(/#[\w\d_-]+/g, "");

  // 3) Count classes, attributes, and other (single-colon) pseudo-classes
  specificity.B += (selectorToParse.match(/\.[\w\d_-]+/g) || []).length;
  specificity.B += (selectorToParse.match(/\[[^\]]+\]/g) || []).length;
  specificity.B += (selectorToParse.match(/(?<!:):[\w\d_-]+(\([^)]+\))?/g) || [])
    .length;
  selectorToParse = selectorToParse
    .replace(/\.[\w\d_-]+/g, "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/(?<!:):[\w\d_-]+(\([^)]+\))?/g, "");

  // 4) Count pseudo-elements
  specificity.C += (selectorToParse.match(/::[\w\d_-]+/g) || []).length;
  selectorToParse = selectorToParse.replace(/::[\w\d_-]+/g, "");

  // 5) Count element names (ignore the universal selector *)
  specificity.C += selectorToParse
    .split(/[\s>+~]+/)
    .filter((el) => el && el !== "*").length;

  return specificity;
}