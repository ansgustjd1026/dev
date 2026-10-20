"""Readable math for native text-only tooltips; no renderer or extra runtime."""
import re

SYMBOLS = dict(zip(
    'alpha beta gamma delta epsilon theta lambda mu pi rho sigma tau phi omega Gamma Delta Theta Lambda Pi Sigma Phi Omega'.split(),
    'α β γ δ ε θ λ μ π ρ σ τ φ ω Γ Δ Θ Λ Π Σ Φ Ω'.split()))
SYMBOLS.update(times='×', cdot='·', div='÷', pm='±', mp='∓', le='≤', leq='≤',
               ge='≥', geq='≥', ne='≠', neq='≠', approx='≈', equiv='≡',
               infty='∞', sum='∑', prod='∏', int='∫', partial='∂', nabla='∇',
               in_='∈', notin='∉', to='→', rightarrow='→', leftarrow='←',
               Rightarrow='⇒', Leftrightarrow='⇔', degree='°', circ='°',
               ldots='…', cdots='⋯', vert='|', lvert='|', rvert='|')
SYMBOLS['in'] = SYMBOLS.pop('in_')
SUPER = str.maketrans('0123456789+-=()ni', '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ')
SUB = str.maketrans('0123456789+-=()aehijklmnoprstuvx', '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ')


def readable_math(text):
    if not any(marker in text for marker in ('\\', '$', '^', '_')):
        return text
    # Remove math delimiters, not arbitrary parentheses or currency signs.
    delimited = bool(re.search(r'\\[([]|\$\$|\$[^$\n]+\$', text))
    text = re.sub(r'\\[([](.*?)\\[)\]]', lambda m: m[1].strip(), text, flags=re.S)
    text = re.sub(r'\$\$(.*?)\$\$', lambda m: m[1].strip(), text, flags=re.S)
    text = re.sub(r'(?<!\w)\$([^$\n]+)\$(?!\w)', lambda m: m[1].strip(), text)

    def render(source, depth=0):
        if depth > 24:
            return source
        output, i = [], 0

        def argument(position):
            while position < len(source) and source[position].isspace():
                position += 1
            if position >= len(source) or source[position] != '{':
                return None, position
            start, level, position = position + 1, 1, position + 1
            while position < len(source):
                if source[position] == '{':
                    level += 1
                elif source[position] == '}':
                    level -= 1
                    if level == 0:
                        return render(source[start:position], depth + 1), position + 1
                position += 1
            return None, start - 1

        def operand(value):
            if re.fullmatch(r'[\w.]+', value):
                return value
            return '(' + value + ')'

        while i < len(source):
            if source[i] == '\\':
                match = re.match(r'\\([A-Za-z]+|.)', source[i:], re.S)
                if not match:
                    output.append(source[i]); i += 1; continue
                command, end = match[1], i + len(match[0])
                if command in ('frac', 'dfrac', 'tfrac'):
                    numerator, next_i = argument(end)
                    denominator, final_i = argument(next_i) if numerator is not None else (None, end)
                    if denominator is not None:
                        output.append(operand(numerator) + '/' + operand(denominator))
                        i = final_i; continue
                elif command == 'sqrt':
                    index = None
                    root_end = end
                    if end < len(source) and source[end] == '[':
                        close = source.find(']', end + 1)
                        if close >= 0:
                            index, root_end = source[end+1:close], close + 1
                    value, final_i = argument(root_end)
                    if value is not None:
                        prefix = '√' if index is None or index == '2' else '∛' if index == '3' else f'root[{index}]'
                        output.append(prefix + operand(value)); i = final_i; continue
                elif command in ('text', 'mathrm', 'mathbf', 'mathit', 'operatorname', 'boxed'):
                    value, final_i = argument(end)
                    if value is not None:
                        output.append(value); i = final_i; continue
                elif command in ('left', 'right', 'displaystyle', 'textstyle'):
                    i = end; continue
                if command in SYMBOLS:
                    output.append(SYMBOLS[command])
                elif command in (',', ';', 'quad', 'qquad', ' '):
                    output.append(' ')
                elif command == '!':
                    pass
                elif command in ('{', '}', '%', '$', '_', '#'):
                    output.append(command)
                else:
                    output.append(match[0])  # Preserve unsupported / malformed notation.
                i = end; continue
            if source[i] in '^_' and output and not source[i-1].isspace():
                value, final_i = argument(i + 1)
                if value is None and i + 1 < len(source) and source[i+1].isalnum():
                    value, final_i = source[i+1], i + 2
                if value is not None:
                    table = SUPER if source[i] == '^' else SUB
                    if all(ord(char) in table for char in value):
                        output.append(value.translate(table))
                    elif source[i+1:i+2] == '{':
                        output.append(source[i] + '(' + value + ')')
                    else:
                        output.append(source[i] + value)
                    i = final_i; continue
            output.append(source[i]); i += 1
        return ''.join(output)

    # Plain identifiers/file names containing '_' should remain intact.
    if not delimited and '\\' not in text and '^' not in text:
        return text
    return render(text)
