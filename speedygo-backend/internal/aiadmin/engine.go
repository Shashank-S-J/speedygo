package aiadmin

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/speedygo/speedygo/internal/config"
	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// Engine provides AI-powered admin capabilities via Groq LLM.
type Engine struct {
	db         *gorm.DB
	log        *slog.Logger
	groqKey    string
	groqURL    string
	groqModel  string
	httpClient *http.Client
}

func NewEngine(db *gorm.DB, cfg config.AIConfig, log *slog.Logger) *Engine {
	return &Engine{
		db:         db,
		log:        log,
		groqKey:    cfg.GroqAPIKey,
		groqURL:    cfg.GroqBaseURL,
		groqModel:  cfg.GroqModel,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

// ChatMessage represents a message in the Groq API format.
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type groqRequest struct {
	Model    string        `json:"model"`
	Messages []ChatMessage `json:"messages"`
	Temp     float64       `json:"temperature"`
	MaxToks  int           `json:"max_tokens"`
}

type groqResponse struct {
	Choices []struct {
		Message ChatMessage `json:"message"`
	} `json:"choices"`
}

// Query sends a natural language query to Groq and returns the AI response.
func (e *Engine) Query(prompt string) (string, error) {
	if e.groqKey == "" {
		return "", fmt.Errorf("Groq API key not configured")
	}

	systemPrompt := `You are an AI admin assistant for SpeedyGo, a goods transport platform.
You help administrators with:
- Analyzing user data, booking patterns, and platform metrics
- Converting natural language queries to structured database query parameters
- Reviewing KYC documents for anomalies
- Triaging reports and suggesting resolutions
- Providing insights on platform operations

When asked to search for data, respond with a JSON object containing query parameters.
When asked for analysis, provide clear structured insights.
Always be concise and actionable.`

	reqBody := groqRequest{
		Model: e.groqModel,
		Messages: []ChatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: prompt},
		},
		Temp:    0.3,
		MaxToks: 1024,
	}

	payload, _ := json.Marshal(reqBody)
	req, _ := http.NewRequest("POST", e.groqURL+"/chat/completions", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+e.groqKey)

	resp, err := e.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("groq request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("groq returned %d: %s", resp.StatusCode, string(body))
	}

	var result groqResponse
	json.Unmarshal(body, &result)
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("no response from Groq")
	}

	return result.Choices[0].Message.Content, nil
}

// AnalyzeReport uses AI to triage a report and suggest severity.
func (e *Engine) AnalyzeReport(category, description string, chatHistory string) (float64, []string, string, error) {
	prompt := fmt.Sprintf(`Analyze this user report for severity and categorization:

Category: %s
Description: %s
Chat History (if available): %s

Respond in JSON format:
{
  "severity": 0.0-1.0,
  "tags": ["tag1", "tag2"],
  "summary": "brief analysis",
  "recommended_action": "WARNING|SUSPEND_7D|SUSPEND_30D|PERMABAN|DISMISS"
}`, category, description, chatHistory)

	response, err := e.Query(prompt)
	if err != nil {
		return 0.5, nil, "AI analysis unavailable", err
	}

	var result struct {
		Severity float64  `json:"severity"`
		Tags     []string `json:"tags"`
		Summary  string   `json:"summary"`
	}
	if err := json.Unmarshal([]byte(response), &result); err != nil {
		return 0.5, nil, response, nil
	}

	return result.Severity, result.Tags, result.Summary, nil
}

// AnalyzeKYC reviews KYC documents for anomalies.
func (e *Engine) AnalyzeKYC(docInfo map[string]interface{}) (float64, []string, error) {
	docJSON, _ := json.Marshal(docInfo)
	prompt := fmt.Sprintf(`Review this KYC document submission for a goods transport platform:

Document Info: %s

Check for:
1. Document quality issues (blurry, cropped, suspicious edits)
2. Name/DOB inconsistencies across documents
3. Expired documents
4. Face mismatch indicators

Respond in JSON:
{
  "risk_score": 0.0-1.0,
  "flags": ["flag1", "flag2"],
  "recommendation": "APPROVE|REJECT|MANUAL_REVIEW"
}`, string(docJSON))

	response, err := e.Query(prompt)
	if err != nil {
		return 0.5, []string{"ai_unavailable"}, err
	}

	var result struct {
		RiskScore float64  `json:"risk_score"`
		Flags     []string `json:"flags"`
	}
	if err := json.Unmarshal([]byte(response), &result); err != nil {
		return 0.5, []string{"parse_error"}, nil
	}

	return result.RiskScore, result.Flags, nil
}

// TranslateQuery converts natural language to structured search params.
func (e *Engine) TranslateQuery(nlQuery string) (map[string]interface{}, error) {
	prompt := fmt.Sprintf(`Convert this admin search query to structured parameters:

Query: "%s"

Available fields: role (CUSTOMER/TRANSPORTER), status (ACTIVE/SUSPENDED/BANNED),
report_count_min, report_count_max, warning_count_min,
city, created_after, created_before, sort (field + ASC/DESC)

Respond ONLY with a JSON object of query parameters. Example:
{"role":"TRANSPORTER","report_count_min":3,"sort":"report_count DESC"}`, nlQuery)

	response, err := e.Query(prompt)
	if err != nil {
		return nil, err
	}

	var params map[string]interface{}
	if err := json.Unmarshal([]byte(response), &params); err != nil {
		return map[string]interface{}{"raw_response": response}, nil
	}
	return params, nil
}

// Handler exposes AI admin endpoints.
type Handler struct {
	engine *Engine
}

func NewHandler(engine *Engine) *Handler {
	return &Handler{engine: engine}
}

// AIQuery POST /admin/ai/query
func (h *Handler) AIQuery(c *fiber.Ctx) error {
	var body struct {
		Query string `json:"query"`
		Type  string `json:"type"` // search, analyze, insight
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid body"})
	}

	switch body.Type {
	case "search":
		params, err := h.engine.TranslateQuery(body.Query)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": true, "message": err.Error()})
		}
		return c.JSON(fiber.Map{"type": "search", "params": params})

	default:
		response, err := h.engine.Query(body.Query)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": true, "message": err.Error()})
		}
		return c.JSON(fiber.Map{"type": "response", "content": response})
	}
}
