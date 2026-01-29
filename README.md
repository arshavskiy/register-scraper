# Estonian Business Register Crawler

A Node.js web scraper that extracts company information from the Estonian Business Register (ariregister.rik.ee).

## 🚀 Features

- ✅ Automated company data extraction
- ✅ Modular and functional code architecture
- ✅ Configurable via environment variables
- ✅ Full-page screenshot capture
- ✅ JSON output with structured data
- ✅ Extracts 12 key sections including:
  - General information
  - VAT information
  - Right of representation
  - Contacts
  - Shareholders
  - Tax information
  - Activity licenses
  - Annual reports
  - Areas of activity
  - Articles of association
  - Beneficial owners
  - Data protection officer

## 📋 Prerequisites

- Node.js 16.x or higher
- npm or yarn

## 🛠️ Installation

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd register-crawler
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
```

Edit `.env` to customize your configuration (optional - defaults work out of the box).

## 🎯 Usage

### Basic Usage

Search for a company by name:

```bash
node searchCompany.js "BOLT OPERATIONS OÜ"
```

### Output

The script generates:
- **Screenshot**: `./data/YYYY-MM-DD/CompanyName.jpg`
- **JSON Data**: `./data/YYYY-MM-DD/CompanyName.json`

### Example Output

```
Searching for: BOLT OPERATIONS OÜ

📋 Section extraction status:
☑ General information
☑ VAT information
☑ Right of representation
☑ Contacts
☑ Shareholders
☑ Tax information
☑ Activity licenses and notices of economic activities
☑ Annual reports
☑ Areas of activity
☑ Articles of association
☑ Beneficial owners
☑ Data protection officer

Found: 12/12 sections

Execution time: 3542.67ms (3.54s)
```

## ⚙️ Configuration

All configuration is managed through the `.env` file:

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `https://ariregister.rik.ee` | Base URL for the registry |
| `SEARCH_URL` | `https://ariregister.rik.ee/eng` | Search page URL |
| `DATA_FOLDER` | `./data` | Output folder for extracted data |
| `BROWSER_HEADLESS` | `true` | Run browser in headless mode |
| `SELECTOR_SEARCH_INPUT` | `input#company_search` | CSS selector for search input |
| `SELECTOR_SEARCH_BUTTON` | `button[type="submit"]` | CSS selector for search button |
| `SELECTOR_RESULT_ROW` | `table tbody tr` | CSS selector for result rows |
| `WANTED_SECTIONS` | (see .env) | Comma-separated list of sections to extract |

### Example .env Configuration

```bash
# Run in visible browser mode for debugging
BROWSER_HEADLESS=false

# Change output folder
DATA_FOLDER=./output

# Extract only specific sections
WANTED_SECTIONS=General information,Contacts,Shareholders
```

## 📂 Project Structure

```
crowler-buss/
├── .env                    # Environment configuration (gitignored)
├── .env.example            # Environment template
├── .gitignore              # Git ignore rules
├── package.json            # Node.js dependencies
├── searchCompany.js        # Main application
├── README.md               # This file
└── data/                   # Output folder (gitignored)
    └── YYYY-MM-DD/
        ├── CompanyName.jpg
        └── CompanyName.json
```

## 🏗️ Architecture

The application is built with a modular, functional architecture:

### Modules

1. **Configuration** - Environment-based config management
2. **File System Utilities** - Folder creation, JSON saving
3. **Browser Navigation** - Page navigation and interaction
4. **HTML Extraction** - Data parsing with Cheerio
5. **Reporting** - Status logging and progress tracking
6. **Main Orchestration** - Coordinates all modules

### Key Technologies

- **Playwright** - Browser automation
- **Cheerio** - HTML parsing (jQuery-like API)
- **dotenv** - Environment variable management
- **ES Modules** - Modern JavaScript imports

## 📊 Output Format

### JSON Structure

```json
[
  {
    "name": "BOLT OPERATIONS OÜ"
  },
  {
    "title": "General information",
    "fields": {
      "Registry code": "14532901",
      "Legal form": "Private limited company",
      "Status": "Entered into the register",
      "Capital": "Capital is 2 701 €",
      "Registered": "25.07.2018"
    },
    "content": "Full text content of the section...",
    "links": [
      {
        "text": "PDF",
        "href": "https://ariregister.rik.ee/eng/company/14532901/file/9013151607"
      }
    ]
  }
]
```

### Data Structure

Each section contains:
- **title**: Section name
- **fields**: Key-value pairs (label → value)
- **content**: Full text content
- **links**: Array of { text, href } objects (relative URLs converted to absolute)

## 🐛 Debugging

### Run in visible browser mode

```bash
# In .env
BROWSER_HEADLESS=false
```

### View extraction status

The script automatically prints a checkbox list showing which sections were found.

### Common Issues

**Problem**: "Company name is required" error
```bash
# Solution: Wrap company name in quotes
node searchCompany.js "BOLT OPERATIONS OÜ"
```

**Problem**: Some sections not found
- Check if the company page structure has changed
- Update selectors in `.env` if needed
- Verify `WANTED_SECTIONS` spelling matches page exactly

## 🔒 Security

- `.env` file is gitignored (contains potentially sensitive configuration)
- Output data folder is gitignored (may contain company information)
- Use `.env.example` as a template for team sharing

## 📝 License

ISC

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📧 Support

For issues or questions, please open an issue on GitHub.

## 🎯 Roadmap

- [ ] Add TypeScript support
- [ ] Add unit tests
- [ ] Support batch company searches
- [ ] Add retry logic for failed requests
- [ ] Export to CSV/Excel format
- [ ] Add CLI progress bar
- [ ] Support multiple languages (EST/ENG/RUS)

---

Made with ❤️ for Estonian business data extraction
