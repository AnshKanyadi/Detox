# Detox - Privacy Protection for Social Media

**Automatically detect and redact sensitive information before you post.**

Detox is a Chrome extension that scans images for personally identifiable information (PII) like phone numbers, emails, and addresses before you upload them to Instagram. It prevents accidental data leaks by automatically blacking out sensitive content.

![Detox Demo](docs/demo.gif)

##  Features

- **Real-time Detection** - Scans images as you upload
- **Smart OCR** - Uses AI-powered text recognition
- **12+ Pattern Types** - Detects phones, emails, SSN, credit cards, passwords, WiFi credentials, and more
- **Automatic Redaction** - Black boxes over sensitive areas
- **Privacy-First** - Images are never stored, processed in memory only
- **Fast** - OCR completes in 5-15 seconds

## What It Detects

| Type | Example |
|------|---------|
| Phone Numbers | (415) 123-4567, +1-800-555-0199 |
| Email Addresses | john@example.com |
| Social Security | 123-45-6789 |
| Credit Cards | 4111-1111-1111-1111 |
| IP Addresses | 192.168.1.1 |
| Passwords | password: secret123 |
| WiFi Credentials | SSID: MyNetwork |
| API Keys | api_key: sk_live_xxx |
| Dates of Birth | 01/15/1990 |
| ZIP Codes | 94102, 94102-1234 |

##  How It Works

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Upload    │ ──▶ │   Detox     │ ──▶ │  Redacted   │
│   Image     │     │   Scans     │     │   Image     │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Backend    │
                    │  OCR + AI   │
                    └─────────────┘
```

1. **Intercept** - Extension catches image uploads on Instagram
2. **Analyze** - Image sent to secure backend for OCR
3. **Detect** - Pattern matching identifies sensitive info
4. **Redact** - Black boxes drawn over sensitive regions
5. **Upload** - Safe image uploaded to Instagram

## 🛠️ Tech Stack

**Extension:**
- Vanilla JavaScript
- Chrome Extension Manifest V3
- Canvas API for redaction

**Backend:**
- Python FastAPI
- RapidOCR (ONNX-based OCR)
- Docker + Railway

## 📦 Installation

### Chrome Extension

1. Clone this repo
2. Go to `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the repo folder

### Backend (Self-hosted)

See [backend/README.md](backend/README.md) for deployment instructions.

## 🔐 Privacy & Security

- **Zero Storage** - Images are never saved to disk
- **No Logging** - Image data is never logged
- **In-Memory Only** - All processing happens in RAM
- **Immediate Deletion** - Data cleared after processing
- **Rate Limited** - Protection against abuse
- **HTTPS Only** - All traffic encrypted

## 📄 License

This project is licensed under the [MIT License](LICENSE).

## 🤝 Contributing

Contributions are welcome for non-commercial improvements! Please read the license before contributing.

## 📬 Contact

- GitHub: [@anshkanyadi](https://github.com/anshkanyadi)
- Project Link: [https://github.com/anshkanyadi/detox](https://github.com/anshkanyadi/detox)

---

**Built with ❤️ for privacy**
