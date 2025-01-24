import { ModifierNode, Message } from "./interface";
import { ArgumentCountMismatchMessage, CannotExpandArgumentMessage } from "./messages";

export function checkArgumentLength(node: ModifierNode, min?: number, max = min): Message[] | null {
    if ((min !== undefined && node.arguments.length < min)
     || (max !== undefined && node.arguments.length > max)) 
    {
        return [new ArgumentCountMismatchMessage(node.head.start, node.head.end - node.head.start, min, max)];
    }
    return null;
}

export function checkArguments(node: ModifierNode, min?: number, max = min): Message[] | null {
    const arg = node.arguments.find((x) => x.expansion === undefined);
    if (arg !== undefined) {
        // debugger;
        return [new CannotExpandArgumentMessage(arg.start, arg.end - arg.start)];
    }
    return checkArgumentLength(node, min, max);
}
