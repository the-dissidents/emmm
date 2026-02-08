const replEscapedSequences = {
  't': '\t',
  'n': '\n',
  'v': '\v'
};

export function replaceAll(original: string, expr: RegExp, repl: string) {
    let match: RegExpExecArray | null;
    let newStr = original;

    expr.lastIndex = 0;
    while ((match = expr.exec(newStr)) !== null) {
        const replacement = getReplacement(match, repl);
        newStr = newStr.substring(0, match.index)
               + replacement
               + newStr.substring(match.index + match.length);
        expr.lastIndex += replacement.length - match[0].length;
    }
    return newStr;
}

export function getReplacement(match: RegExpExecArray, repl: string) {
  let i = 0;
  let result = '';
  const digits = /\d{1,2}/y;
  while (i < repl.length) {
    const char = repl[i];
    if (char == '\\') {
      i++;
      if (i >= repl.length) {
        result += char;
        break;
      }
      const char2 = repl[i];
      result += (char2 in replEscapedSequences)
        ? replEscapedSequences[char2 as keyof typeof replEscapedSequences] : char2;
    } else if (char == '$') {
      i++;
      if (i >= repl.length) {
        result += char;
        break;
      }
      const char2 = repl[i];
      if (char2 == '&') {
        result += match[0];
      } else if (char2 == '$') {
        result += '$';
      } else {
        digits.lastIndex = i;
        const match2 = digits.exec(repl);
        if (match2) {
          result += match[Number.parseInt(match2[0])] ?? '';
          i += match2[0].length - 1;
        } else {
          result += char + char2;
        }
      }
    } else {
      result += char;
    }
    i++;
  }
  return result;
}
