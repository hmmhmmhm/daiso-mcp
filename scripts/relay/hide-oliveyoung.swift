import AppKit
import Foundation
import Darwin

func argument(_ name: String, fallback: URL) -> URL {
    guard let index = CommandLine.arguments.firstIndex(of: name) else { return fallback }
    guard index + 1 < CommandLine.arguments.count,
          CommandLine.arguments[index + 1].hasPrefix("/") else { exit(2) }
    return URL(fileURLWithPath: CommandLine.arguments[index + 1]).standardizedFileURL
}
// 새 프로세스 준비 전의 이전 스냅샷이나 오래된 상태로 숨기지 않습니다.
func readinessAllowsHiding(_ value: [String: Any], launchedAt: TimeInterval, now: TimeInterval) -> Bool {
    guard let checkedAt = value["checkedAt"] as? Double,
          checkedAt >= launchedAt + 1, checkedAt <= now + 5, now - checkedAt <= 180,
          let checks = value["checks"] as? [String: Any],
          let oliveyoung = checks["oliveyoung"] as? [String: Any],
          oliveyoung["state"] as? String == "ready", oliveyoung["failed"] as? Bool == false else { return false }
    return true
}

let base = argument("--state-base", fallback: FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/DaisoRelay"))
let runtime = argument("--runtime", fallback: base.appendingPathComponent("runtime"))
let marker = base.appendingPathComponent("state/browser-owner.json")
let executable = runtime.appendingPathComponent("Browser.app/Contents/MacOS/Google Chrome for Testing").path

func safeMarkerPath() -> Bool {
    var path = marker
    while path.path != "/" {
        if path.resolvingSymlinksInPath().path != path.path { return false }
        path.deleteLastPathComponent()
    }
    return true
}

func readyForHide(_ app: NSRunningApplication) -> Bool {
    let status = base.appendingPathComponent("ops-status.json")
    guard let launched = app.launchDate,
          status.resolvingSymlinksInPath().path == status.path,
          let attributes = try? FileManager.default.attributesOfItem(atPath: status.path),
          attributes[.type] as? FileAttributeType == .typeRegular,
          attributes[.ownerAccountID] as? UInt32 == getuid(),
          let mode = attributes[.posixPermissions] as? UInt16, mode & 0o077 == 0,
          let size = attributes[.size] as? UInt64, size <= 65536,
          let data = try? Data(contentsOf: status),
          let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
    return readinessAllowsHiding(value, launchedAt: launched.timeIntervalSince1970, now: Date().timeIntervalSince1970)
}

// 소유 마커가 바뀌거나 검증에 실패하면 숨김을 생략한다.
func target() -> NSRunningApplication? {
    guard safeMarkerPath(), let attributes = try? FileManager.default.attributesOfItem(atPath: marker.path),
          attributes[.type] as? FileAttributeType == .typeRegular,
          attributes[.ownerAccountID] as? UInt32 == getuid(),
          let mode = attributes[.posixPermissions] as? UInt16, mode & 0o077 == 0,
          let size = attributes[.size] as? UInt64, size <= 16384,
          let data = try? Data(contentsOf: marker),
          let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let guardPid = object["guardPid"] as? Int, guardPid > 1, guardPid <= Int(Int32.max),
          let browser = object["browser"] as? [String: Any],
          let pid = browser["pid"] as? Int, pid > 1, pid <= Int(Int32.max),
          browser["ppid"] as? Int == guardPid,
          let birth = browser["birth"] as? String,
          let app = NSRunningApplication(processIdentifier: pid_t(pid)),
          app.executableURL?.path == executable, !app.isTerminated else { return nil }
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/bin/ps")
    process.arguments = ["-p", String(pid), "-o", "uid=,ppid=,lstart="]
    let pipe = Pipe()
    process.standardOutput = pipe
    process.standardError = FileHandle.nullDevice
    guard (try? process.run()) != nil else { return nil }
    let output = pipe.fileHandleForReading.readDataToEndOfFile()
    process.waitUntilExit()
    let fields = String(decoding: output, as: UTF8.self).split(whereSeparator: { $0.isWhitespace })
    guard process.terminationStatus == 0, fields.count == 7,
          UInt32(fields[0]) == getuid(), Int(fields[1]) == guardPid,
          fields.dropFirst(2).joined(separator: " ") == birth.split(whereSeparator: { $0.isWhitespace }).joined(separator: " "),
          safeMarkerPath(), (try? Data(contentsOf: marker)) == data else { return nil }
    return app
}

// 매초 확인하되 이미 숨겨진 앱에는 추가 UI 요청을 보내지 않는다.
func hideOwnedBrowser() {
    guard let app = target(), !app.isHidden, readyForHide(app) else { return }
    _ = app.hide()
}

if CommandLine.arguments.contains("--check") {
    if let app = target() {
        print("owned=true hidden=\(app.isHidden) pid=\(app.processIdentifier) readyToHide=\(readyForHide(app))")
    } else {
        print("owned=false")
        exit(1)
    }
} else {
    hideOwnedBrowser()
    let timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in hideOwnedBrowser() }
    RunLoop.main.add(timer, forMode: .common)
    RunLoop.main.run()
}
