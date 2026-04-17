import os

def generate_individual_contexts(root_dir):
    src_path = os.path.join(root_dir, 'src')
    
    # 1. Handle Main/Root files (package.json and src root files)
    main_files = []
    pkg_path = os.path.join(root_dir, 'package.json')
    if os.path.exists(pkg_path):
        main_files.append((pkg_path, 'package.json'))
    
    # Files directly in src/ (not in subfolders)
    if os.path.exists(src_path):
        for item in os.listdir(src_path):
            item_path = os.path.join(src_path, item)
            if os.path.isfile(item_path):
                main_files.append((item_path, os.path.relpath(item_path, root_dir)))
    
    if main_files:
        bundle_to_file("context_main.md", main_files)

    # 2. Handle Subfolders in src/
    if os.path.exists(src_path):
        for item in os.listdir(src_path):
            item_path = os.path.join(src_path, item)
            if os.path.isdir(item_path):
                subfolder_files = []
                for sub_root, _, sub_files in os.walk(item_path):
                    for f in sub_files:
                        f_path = os.path.join(sub_root, f)
                        subfolder_files.append((f_path, os.path.relpath(f_path, root_dir)))
                
                if subfolder_files:
                    bundle_to_file(f"context_src_{item}.md", subfolder_files)

def bundle_to_file(output_filename, file_list):
    print(f"Generating {output_filename}...")
    with open(output_filename, 'w', encoding='utf-8') as out:
        out.write(f"# Context: {output_filename}\n\n")
        for file_path, rel_path in file_list:
            write_file_to_md(file_path, rel_path, out)

def write_file_to_md(file_path, rel_path, out):
    _, ext = os.path.splitext(file_path)
    lang = ext.lstrip('.') if ext else ""
    if lang == 'ts': lang = 'typescript'
    elif lang == 'py': lang = 'python'
    elif lang == 'js': lang = 'javascript'
    
    out.write(f"## File: {rel_path}\n")
    out.write(f"```{lang}\n")
    
    try:
        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
            for i, line in enumerate(f, 1):
                out.write(f"{i:4} | {line}")
            if i > 0 and not line.endswith('\n'):
                out.write('\n')
    except Exception as e:
        out.write(f"Error reading file: {str(e)}\n")
    
    out.write("```\n\n")

if __name__ == "__main__":
    generate_individual_contexts(".")
    print("Done! Check your folder for context_*.md files.")
