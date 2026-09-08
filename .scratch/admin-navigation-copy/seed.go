// Disposable browser fixtures. Run from template/api on Centaurus only.
package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"golang.org/x/crypto/argon2"
)

func main() {
	if err := seed(); err != nil {
		panic(err)
	}
}

func seed() error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	db, err := sql.Open("pgx", "postgres://temvia:online-acceptance-only@127.0.0.1:26432/online_acceptance?sslmode=disable")
	if err != nil {
		return err
	}
	defer db.Close()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var database string
	if err := tx.QueryRowContext(ctx, "SELECT current_database()").Scan(&database); err != nil {
		return err
	}
	if database != "online_acceptance" {
		return fmt.Errorf("refusing non-acceptance database")
	}
	fixtures := []struct {
		name, email, password string
		permissions           []string
		super                 bool
	}{
		{"Online Manager", "online-manager@example.com", "Manager1!x", []string{"online-users.read", "online-users.write", "operation-logs.read"}, false},
		{"Online Super Admin", "online-super-admin@example.com", "Target1!x", nil, true},
		{"Online Reader", "online-reader@example.com", "ReadOnly1!x", []string{"online-users.read"}, false},
		{"No Monitor Access", "online-no-read@example.com", "NoRead1!x", []string{"users.read"}, false},
		{"History Reader", "online-history-reader@example.com", "History1!x", []string{"operation-logs.read"}, false},
	}
	for _, fixture := range fixtures {
		salt := make([]byte, 16)
		if _, err := rand.Read(salt); err != nil {
			return err
		}
		tag := argon2.IDKey([]byte(fixture.password), salt, 3, 65536, 4, 32)
		hash := "$argon2id$v=19$m=65536,t=3,p=4$" + base64.RawStdEncoding.EncodeToString(salt) + "$" + base64.RawStdEncoding.EncodeToString(tag)
		var userID, roleID string
		err := tx.QueryRowContext(ctx, `INSERT INTO auth_users(name,email,email_canonical,password_hash) VALUES($1,$2,$2,$3)
   ON CONFLICT(email_canonical) DO UPDATE SET name=EXCLUDED.name,password_hash=EXCLUDED.password_hash,auth_version=auth_users.auth_version+1 RETURNING id::text`, fixture.name, fixture.email, hash).Scan(&userID)
		if err != nil {
			return err
		}
		if fixture.super {
			err = tx.QueryRowContext(ctx, "SELECT id::text FROM auth_roles WHERE system_key='super_admin'").Scan(&roleID)
		} else {
			err = tx.QueryRowContext(ctx, `INSERT INTO auth_roles(name,name_canonical,description) VALUES($1,$2,'Disposable navigation acceptance role')
    ON CONFLICT(name_canonical) DO UPDATE SET name=EXCLUDED.name RETURNING id::text`, fixture.name, strings.ToLower(fixture.name)).Scan(&roleID)
			if err != nil {
				return err
			}
			if _, err := tx.ExecContext(ctx, "DELETE FROM auth_role_permissions WHERE role_id=$1::uuid", roleID); err != nil {
				return err
			}
			for _, permission := range fixture.permissions {
				if _, err := tx.ExecContext(ctx, "INSERT INTO auth_role_permissions(role_id,permission_key) VALUES($1::uuid,$2)", roleID, permission); err != nil {
					return err
				}
			}
		}
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM auth_user_roles WHERE user_id=$1::uuid", userID); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, "INSERT INTO auth_user_roles(user_id,role_id) VALUES($1::uuid,$2::uuid)", userID, roleID); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, "UPDATE auth_setup SET completed_at=clock_timestamp(),token_digest=NULL,token_expires_at=NULL WHERE singleton=true"); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	fmt.Println("Five isolated navigation acceptance accounts are ready.")
	return nil
}
