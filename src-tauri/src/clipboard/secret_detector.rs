// A7Box Clipboard Manager — Secret Detector
// Detects common credential patterns; matched clips are flagged `is_secret`
// and masked in the UI / encrypted at rest.

use regex::Regex;
use std::sync::OnceLock;

struct SecretPatterns {
    aws_access_key: Regex,
    aws_secret_key: Regex,
    github_token: Regex,
    jwt: Regex,
    private_key: Regex,
    bearer: Regex,
    generic_assign: Regex,
    openai_key: Regex,
    slack_token: Regex,
    connection_string: Regex,
}

fn patterns() -> &'static SecretPatterns {
    static PATTERNS: OnceLock<SecretPatterns> = OnceLock::new();
    PATTERNS.get_or_init(|| SecretPatterns {
        aws_access_key: Regex::new(r"AKIA[0-9A-Z]{16}").unwrap(),
        aws_secret_key: Regex::new(r#"(?i)aws.{0,20}['"][0-9a-zA-Z/+]{40}['"]"#).unwrap(),
        github_token: Regex::new(r"gh[pousr]_[A-Za-z0-9]{20,}").unwrap(),
        jwt: Regex::new(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}").unwrap(),
        private_key: Regex::new(r"-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----").unwrap(),
        bearer: Regex::new(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{16,}").unwrap(),
        generic_assign: Regex::new(r#"(?i)\b(api[_-]?key|apikey|secret[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|pwd)\b\s*[=:]\s*['"]?[A-Za-z0-9._~+/=@-]{8,}"#).unwrap(),
        openai_key: Regex::new(r"sk-[A-Za-z0-9]{20,}").unwrap(),
        slack_token: Regex::new(r"xox[baprs]-[A-Za-z0-9-]{10,}").unwrap(),
        connection_string: Regex::new(r"(?i)(postgres|mysql|mongodb|redis|amqp)://[^\s:@]+:[^\s@]+@").unwrap(),
    })
}

/// Returns true when the text likely contains a credential.
/// Only the first 64KB is scanned to keep the hot path cheap.
pub fn contains_secret(text: &str) -> bool {
    let sample: String = text.chars().take(65536).collect();
    let sample = sample.as_str();
    let p = patterns();
    p.aws_access_key.is_match(sample)
        || p.aws_secret_key.is_match(sample)
        || p.github_token.is_match(sample)
        || p.jwt.is_match(sample)
        || p.private_key.is_match(sample)
        || p.bearer.is_match(sample)
        || p.generic_assign.is_match(sample)
        || p.openai_key.is_match(sample)
        || p.slack_token.is_match(sample)
        || p.connection_string.is_match(sample)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_aws_key() {
        assert!(contains_secret("AKIAIOSFODNN7EXAMPLE"));
    }

    #[test]
    fn test_github_token() {
        assert!(contains_secret("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12"));
    }

    #[test]
    fn test_jwt() {
        assert!(contains_secret("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c"));
    }

    #[test]
    fn test_private_key() {
        assert!(contains_secret("-----BEGIN RSA PRIVATE KEY-----\nMIIE..."));
    }

    #[test]
    fn test_generic_assignment() {
        assert!(contains_secret("api_key=abcd1234efgh5678"));
        assert!(contains_secret("PASSWORD: supersecretpw"));
    }

    #[test]
    fn test_connection_string() {
        assert!(contains_secret("postgres://admin:p4ssw0rd@localhost:5432/db"));
    }

    #[test]
    fn test_normal_text_not_flagged() {
        assert!(!contains_secret("hello world"));
        assert!(!contains_secret("const x = 42;"));
        assert!(!contains_secret("https://github.com/bluvenr/a7box"));
    }
}
