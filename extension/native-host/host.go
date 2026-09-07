package main

import (
	"bufio"
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type Message struct {
	Action string `json:"action"`
}

type Response struct {
	OK      bool   `json:"ok"`
	Running bool   `json:"running,omitempty"`
	Message string `json:"message,omitempty"`
	Error   string `json:"error,omitempty"`
}

const port = 8765

func main() {
	reader := bufio.NewReader(os.Stdin)
	for {
		msg, err := readNativeMessage(reader)
		if err != nil {
			if err == io.EOF {
				return
			}
			return
		}

		var request Message
		if err := json.Unmarshal(msg, &request); err != nil {
			writeResponse(Response{OK: false, Error: "Invalid native message"})
			continue
		}

		switch strings.ToLower(request.Action) {
		case "start":
			writeResponse(startServer())
		case "status":
			writeResponse(serverStatus())
		default:
			writeResponse(Response{OK: false, Error: "Unknown action"})
		}
	}
}

func readNativeMessage(r *bufio.Reader) ([]byte, error) {
	header := make([]byte, 4)
	if _, err := io.ReadFull(r, header); err != nil {
		return nil, err
	}
	length := binary.LittleEndian.Uint32(header)
	if length > 1024*1024 {
		return nil, fmt.Errorf("message too large")
	}
	data := make([]byte, length)
	if _, err := io.ReadFull(r, data); err != nil {
		return nil, err
	}
	return data, nil
}

func writeResponse(v Response) {
	data, _ := json.Marshal(v)
	var header [4]byte
	binary.LittleEndian.PutUint32(header[:], uint32(len(data)))
	_, _ = os.Stdout.Write(header[:])
	_, _ = os.Stdout.Write(data)
	_ = os.Stdout.Sync()
}

func hostDir() string {
	exe, err := os.Executable()
	if err != nil {
		return "."
	}
	dir, err := filepath.Abs(filepath.Dir(exe))
	if err != nil {
		return "."
	}
	return dir
}

func serverDir() string {
	return filepath.Clean(filepath.Join(hostDir(), "..", "..", "server"))
}

func serverStatus() Response {
	client := &http.Client{Timeout: 700 * time.Millisecond}
	resp, err := client.Get("http://127.0.0.1:8765/api/status")
	if err != nil {
		return Response{OK: true, Running: false, Message: "Server is not running"}
	}
	defer resp.Body.Close()

	var body struct {
		Running bool `json:"running"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return Response{OK: true, Running: false, Message: "Server is not running"}
	}
	return Response{OK: true, Running: body.Running, Message: map[bool]string{true: "Server is running", false: "Server is not running"}[body.Running]}
}

func startServer() Response {
	if status := serverStatus(); status.Running {
		return Response{OK: true, Running: true, Message: "Server was already running"}
	}

	node, err := exec.LookPath("node.exe")
	if err != nil {
		node, err = exec.LookPath("node")
	}
	if err != nil {
		return Response{OK: false, Error: "Node.js was not found in PATH. Install Node.js and restart Chrome."}
	}

	dir := serverDir()
	script := filepath.Join(dir, "server.js")
	if _, err := os.Stat(script); err != nil {
		return Response{OK: false, Error: "server.js was not found next to the extension."}
	}

	logPath := filepath.Join(dir, "server.log")
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return Response{OK: false, Error: "Could not open server.log: " + err.Error()}
	}

	cmd := exec.Command(node, script)
	cmd.Dir = dir
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}

	if err := cmd.Start(); err != nil {
		logFile.Close()
		return Response{OK: false, Error: "Could not start Node server: " + err.Error()}
	}
	_ = logFile.Close()

	// Give Node a moment to bind the port, then verify it.
	for i := 0; i < 15; i++ {
		time.Sleep(100 * time.Millisecond)
		if status := serverStatus(); status.Running {
			return Response{OK: true, Running: true, Message: "Server started"}
		}
	}

	return Response{OK: false, Running: false, Error: "Node started, but the server did not become ready. Check server\\server.log."}
}

// Keep imports honest when building with older Go toolchains.
var _ = bytes.MinRead
var _ = net.IPv4len
var _ = strconv.IntSize
