package domain

import "time"

type Locale string

const (
	LocaleEnglish Locale = "en"
	LocaleChinese Locale = "zh-CN"
)

func (l Locale) Valid() bool { return l == LocaleEnglish || l == LocaleChinese }

type User struct {
	ID        string
	Name      string
	Email     string
	CreatedAt time.Time
}

type Account struct {
	User         User
	PasswordHash string
	AuthVersion  int64
}
