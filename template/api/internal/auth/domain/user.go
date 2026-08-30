package domain

import "time"

type User struct {
	ID        string
	Name      string
	Email     string
	CreatedAt time.Time
}

type Account struct {
	User         User
	PasswordHash string
}
