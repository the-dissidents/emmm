import { SimpleScanner } from "./front";
import { Parser } from "./parser";

let text = String.raw`
罗素理论中的假命题：

[.eq] \exists x(Kx \& \forall y(Ky \rightarrow y=x) \& Bx)
\tag{4.5}

不存在一个秃头的当今的法国国王。

[.quote] 一段引文
[.quote] 分开的一段引文

[.quote]
:--
在一起的

两段引文

[.quote] 外加镶嵌的一段
[.quote] :--
还有继续镶嵌的

最后两段。
--:
--:
`
let doc = new Parser(new SimpleScanner(text)).parse();
console.log(doc.debugDump())