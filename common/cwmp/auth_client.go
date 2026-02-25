package cwmp

import (
	//	"io/ioutil"
	"crypto/md5"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type myjar struct {
	jar map[string][]*http.Cookie
}

func (p *myjar) SetCookies(u *url.URL, cookies []*http.Cookie) {
	p.jar[u.Host] = cookies
}

func (p *myjar) Cookies(u *url.URL) []*http.Cookie {
	return p.jar[u.Host]
}

func ConnectionRequestAuth(username string, password string, uri string) (bool, error) {
	parsedUrl, parseErr := url.Parse(uri)
	if parseErr != nil {
		return false, parseErr
	}
	uriPath := parsedUrl.RequestURI()

	client := &http.Client{
		Timeout: 10 * time.Second,
	}
	jar := &myjar{}
	jar.jar = make(map[string][]*http.Cookie)
	client.Jar = jar

	// First request to get the 401 challenge
	req, err := http.NewRequest("GET", uri, nil)
	if err != nil {
		return false, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return false, err
	}
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()

	if resp.StatusCode == 401 {
		var authorization map[string]string = DigestAuthParams(resp)
		realmHeader := authorization["realm"]
		qopHeader := authorization["qop"]
		nonceHeader := authorization["nonce"]
		opaqueHeader := authorization["opaque"]
		realm := realmHeader
		// A1
		h := md5.New()
		A1 := fmt.Sprintf("%s:%s:%s", username, realm, password)
		io.WriteString(h, A1)
		HA1 := fmt.Sprintf("%x", h.Sum(nil))

		// A2
		h = md5.New()
		A2 := fmt.Sprintf("GET:%s", uriPath)
		io.WriteString(h, A2)
		HA2 := fmt.Sprintf("%x", h.Sum(nil))

		// response
		cnonce := RandomKey()
		response := H(strings.Join([]string{HA1, nonceHeader, "00000001", cnonce, qopHeader, HA2}, ":"))

		// Create a NEW request for the authenticated attempt
		req2, err := http.NewRequest("GET", uri, nil)
		if err != nil {
			return false, err
		}
		AuthHeader := fmt.Sprintf(`Digest username="%s", realm="%s", nonce="%s", uri="%s", cnonce="%s", nc=00000001, qop=%s, response="%s", opaque="%s", algorithm=MD5`,
			username, realmHeader, nonceHeader, uriPath, cnonce, qopHeader, response, opaqueHeader)
		req2.Header.Set("Authorization", AuthHeader)
		resp2, err := client.Do(req2)
		if err != nil {
			return false, err
		}
		io.Copy(io.Discard, resp2.Body)
		resp2.Body.Close()
		return resp2.StatusCode == 200, nil
	}
	return false, fmt.Errorf("response status code should have been 401, it was %v", resp.StatusCode)
}

/*
Parse Authorization header from the http.Request. Returns a map of
auth parameters or nil if the header is not a valid parsable Digest
auth header.
*/
func DigestAuthParams(r *http.Response) map[string]string {
	s := strings.SplitN(r.Header.Get("Www-Authenticate"), " ", 2)
	if len(s) != 2 || s[0] != "Digest" {
		return nil
	}

	result := map[string]string{}
	for _, kv := range strings.Split(s[1], ",") {
		parts := strings.SplitN(kv, "=", 2)
		if len(parts) != 2 {
			continue
		}
		result[strings.Trim(parts[0], "\" ")] = strings.Trim(parts[1], "\" ")
	}
	return result
}
func RandomKey() string {
	k := make([]byte, 12)
	for bytes := 0; bytes < len(k); {
		n, err := rand.Read(k[bytes:])
		if err != nil {
			panic("rand.Read() failed")
		}
		bytes += n
	}
	return base64.StdEncoding.EncodeToString(k)
}

/*
H function for MD5 algorithm (returns a lower-case hex MD5 digest)
*/
func H(data string) string {
	digest := md5.New()
	digest.Write([]byte(data))
	return fmt.Sprintf("%x", digest.Sum(nil))
}
