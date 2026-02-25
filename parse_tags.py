from html.parser import HTMLParser
import sys

class MyHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        
    def handle_starttag(self, tag, attrs):
        if tag not in ['input', 'br', 'hr', 'img', 'span', 'col', 'path', 'circle', 'svg']:
            self.stack.append((tag, self.getpos()))

    def handle_endtag(self, tag):
        if tag not in ['input', 'br', 'hr', 'img', 'span', 'col', 'path', 'circle', 'svg']:
            if not self.stack:
                print(f"Error: unmatched closing tag </{tag}> at line {self.getpos()[0]}")
                return
            top_tag, pos = self.stack.pop()
            if top_tag != tag:
                print(f"Error: expected </{top_tag}> from line {pos}, but got </{tag}> at line {self.getpos()[0]}")
                self.stack.append((top_tag, pos))

with open('src/app/features/admin/components/crm/customer-crm.component.ts', 'r') as f:
    content = f.read()

start = content.find('template: `')
if start == -1:
    print("template not found")
    sys.exit(1)

template_content = content[start+11:]
template_content = template_content[:template_content.rfind('`')]

parser = MyHTMLParser()
try:
    parser.feed(template_content)
except Exception as e:
    print(f"Parse error: {e}")

print(f"Remaining tags in stack: {len(parser.stack)}")
if len(parser.stack) > 0:
    for t, p in parser.stack:
        print(f"<{t}> at line {p[0]}")
