from pathlib import Path

template = """%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 160 >> stream
BT /F1 14 Tf 72 720 Td ({title}) Tj T* ({line1}) Tj T* ({line2}) Tj T* ({line3}) Tj ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000065 00000 n 
0000000125 00000 n 
0000000261 00000 n 
0000000460 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
534
%%EOF
"""

samples = {
    'hw1_alice.pdf': ("Week 1 Submission - Alice", "for i in range 1 6", "print i", "# Odd even checker"),
    'hw1_bob.pdf': ("Week 1 Submission - Bob", "i = 1", "while i <= 5", "i += 1"),
    'hw2_chris.pdf': ("Week 2 Submission - Chris", "ATM menu", "balance", "withdraw"),
    'hw_ds1_dana.pdf': ("Data Structures - Dana", "Linked list ops", "append", "delete, traverse"),
}

output_dir = Path('data/submissions')
output_dir.mkdir(parents=True, exist_ok=True)

for filename, lines in samples.items():
    safe = tuple(line.replace('(', '[').replace(')', ']') for line in lines)
    content = template.format(title=safe[0], line1=safe[1], line2=safe[2], line3=safe[3])
    (output_dir / filename).write_text(content)
    print(f"wrote {output_dir / filename}")
