// A7Box Clipboard Manager — Content Classifier
// Lightweight regex + heuristic classification, runs in <1ms per clip.

/// Clip categories (kept in sync with frontend types)
pub const CATEGORIES: [&str; 8] = [
    "general", "url", "code", "json", "email", "file-path", "color", "secret",
];

/// Classify plain-text clipboard content. Returns one of CATEGORIES.
pub fn classify_text(text: &str) -> &'static str {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return "general";
    }

    // Single-line candidates first
    if !trimmed.contains('\n') {
        if is_url(trimmed) {
            return "url";
        }
        if is_email(trimmed) {
            return "email";
        }
        if is_file_path(trimmed) {
            return "file-path";
        }
        if is_color(trimmed) {
            return "color";
        }
    }

    if is_json(trimmed) {
        return "json";
    }
    if is_code(trimmed) {
        return "code";
    }
    "general"
}

fn is_url(s: &str) -> bool {
    let lower = s.to_ascii_lowercase();
    (lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("www."))
        && !s.contains(' ')
        && s.len() > 7
}

fn is_email(s: &str) -> bool {
    // Simple, fast email shape check (no full RFC parsing)
    let parts: Vec<&str> = s.split('@').collect();
    if parts.len() != 2 {
        return false;
    }
    let (local, domain) = (parts[0], parts[1]);
    !local.is_empty()
        && local.len() <= 64
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && !s.contains(' ')
}

fn is_file_path(s: &str) -> bool {
    // Windows absolute path: C:\... or \\server\share
    let bytes = s.as_bytes();
    if bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
    {
        return true;
    }
    if s.starts_with("\\\\") && s.len() > 3 {
        return true;
    }
    // Unix absolute path (require a second slash or known root dir to avoid false positives)
    if s.starts_with('/') && s.len() > 2 && s[1..].contains('/') && !s.contains(' ') {
        return true;
    }
    false
}

fn is_color(s: &str) -> bool {
    let lower = s.to_ascii_lowercase();
    if let Some(hex) = lower.strip_prefix('#') {
        let len = hex.len();
        return (len == 3 || len == 4 || len == 6 || len == 8)
            && hex.chars().all(|c| c.is_ascii_hexdigit());
    }
    (lower.starts_with("rgb(") || lower.starts_with("rgba(") || lower.starts_with("hsl(") || lower.starts_with("hsla("))
        && lower.ends_with(')')
}

fn is_json(s: &str) -> bool {
    if s.len() < 2 {
        return false;
    }
    let first = s.chars().next().unwrap();
    let last = s.chars().next_back().unwrap();
    if !((first == '{' && last == '}') || (first == '[' && last == ']')) {
        return false;
    }
    serde_json::from_str::<serde_json::Value>(s).is_ok()
}

fn is_code(s: &str) -> bool {
    const CODE_HINTS: &[&str] = &[
        "function ", "=> ", "const ", "let ", "var ", "import ", "export ",
        "public ", "private ", "class ", "def ", "fn ", "SELECT ", "FROM ",
        "#include", "package ", "namespace ", "<html", "<!DOCTYPE", "<?php",
        "#!/", "return ", "if (", "for (", "while (",
    ];
    let sample: String = s.chars().take(4096).collect();
    let mut score = 0u32;
    for hint in CODE_HINTS {
        if sample.contains(hint) || sample.contains(&hint.to_ascii_lowercase()) {
            score += 1;
        }
    }
    if score >= 1 && (sample.contains('{') || sample.contains(';') || sample.contains('\n')) {
        return true;
    }
    // Braces + newlines heuristic for languages without keyword hits
    sample.contains('{') && sample.contains('}') && sample.contains('\n')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_url() {
        assert_eq!(classify_text("https://github.com/tauri-apps/tauri"), "url");
        assert_eq!(classify_text("www.example.com"), "url");
        assert_eq!(classify_text("not a url"), "general");
    }

    #[test]
    fn test_email() {
        assert_eq!(classify_text("dev@example.com"), "email");
        assert_eq!(classify_text("invalid@domain"), "general");
    }

    #[test]
    fn test_file_path() {
        assert_eq!(classify_text(r"C:\Users\dev\project"), "file-path");
        assert_eq!(classify_text("/usr/local/bin"), "file-path");
    }

    #[test]
    fn test_color() {
        assert_eq!(classify_text("#FF4D4F"), "color");
        assert_eq!(classify_text("rgba(255, 77, 79, 0.5)"), "color");
    }

    #[test]
    fn test_json() {
        assert_eq!(classify_text(r#"{"name":"a7box"}"#), "json");
        assert_eq!(classify_text("[1,2,3]"), "json");
        assert_eq!(classify_text("{invalid json}"), "general");
    }

    #[test]
    fn test_code() {
        assert_eq!(classify_text("const x = () => {\n  return 1;\n};"), "code");
    }

    #[test]
    fn test_chinese_text_is_general() {
        assert_eq!(classify_text("这是一段普通的中文文本"), "general");
    }
}
