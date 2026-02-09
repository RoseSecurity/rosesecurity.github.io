---
layout: post
title:  "The Roadhouse Pattern"
tags: go code patterns quality
---

Imagine that Patrick Swayze is writing an SDK. He's haunted by memories of ripping out a man's throat for a `nil` pointer deference. To recoop, he sits down in his home office and begins writing a function to issue a new HTTP request to the API, applying authentication and common headers. Before he even writes the `NewRequest` logic, he introduces the Roadhouse pattern. The idea is that he wants to fail fast before any work begins, return specific sentinel errors so he knows where it all went wrong, and declare invariants where the guard clauses ARE the documentation for what to accept. Take a look at this function:

```go
// newRequest creates an *http.Request, applying authentication and common
// headers. The path should already include the API version prefix (e.g.
// "/v1/devices").
func (c *Client) newRequest(ctx context.Context, method, path string, body io.Reader) (*http.Request, error) {
	if err := c.validateRequest(ctx, method, path); err != nil {
		return nil, err
	}
	if err := c.validateClient(); err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, method, c.apiURL+path, body)
	if err != nil {
		return nil, err
	}

...

// validateClient checks that the Client is in a usable state.
func (c *Client) validateClient() error {
	if c.apiKey == "" {
		return ErrNoAPIKey
	}

	if c.apiURL == "" {
		return ErrNoAPIURL
	}

	if c.httpClient == nil {
		return ErrNoHTTPClient
	}
	return nil
}

// validateRequest checks that the request parameters are valid.
func (c *Client) validateRequest(ctx context.Context, method, path string) error {
	if ctx == nil {
		return ErrNilContext
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if method == "" {
		return ErrEmptyMethod
	}
	if path == "" {
		return ErrEmptyPath
	}
	return nil
}
```

## "I Want You to Be Nice Until It's Time to Not Be Nice"

Dalton had three rules for his bouncers at the Double Deuce. The Roadhouse pattern has three for your functions:

**1. Fail Fast, Fail at the Door**

Every bad input that slips past your guard clauses is a drunk patron who made it to the bar. Now you've got a `nil` pointer stumbling around your business logic, starting fights and breaking chairs. By the time it panics, you're three stack frames deep and the error message is useless.

**2. Sentinel Errors Tell You Who Started the Fight**

When something goes wrong at 3 AM in production, you don't want a generic "request failed" error. You want to know exactly which precondition was violated. Was it `ErrNoAPIKey`? `ErrEmptyPath`? `ErrNilContext`?

**3. Guard Clauses Are the Dress Code**

Notice how the `validateRequest` and `validateClient` functions read like a checklist of requirements:

- Context must not be nil
- Context must not be cancelled
- Method must not be empty
- Path must not be empty
- API key must be set
- API URL must be set
- HTTP client must exist

That's not just validation; that's documentation.

## The Happy Path Stays Clean

Look at `newRequest` again. After the two validation calls, the rest of the function is pure business logic. No defensive `if apiKey == ""` checks scattered throughout. No `nil` checks before every pointer access. The Roadhouse pattern front-loads the paranoia so the rest of your code can be confident and clean.

Swayze would approve.

---

If you hated this blog, feel free to drop some hateful issues and PRs on [my GitHub](https://github.com/RoseSecurity).
