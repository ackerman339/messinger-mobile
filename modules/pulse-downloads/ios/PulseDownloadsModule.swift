import ExpoModulesCore
import Foundation
import UIKit
import UniformTypeIdentifiers

public final class PulseDownloadsModule: Module {
  private let bookmarkKey = "pulseDownloadsDirectory"
  private let folderName = "Descargas Pulse"
  private let fileQueue = DispatchQueue(label: "pulse.downloads")
  private var pickerDelegate: DownloadsPickerDelegate?

  public func definition() -> ModuleDefinition {
    Name("PulseDownloads")

    AsyncFunction("save") { (source: URL, fileName: String, _: String, promise: Promise) in
      self.fileQueue.async {
        if let location = self.savedDirectory(), location.startAccessingSecurityScopedResource() {
          self.save(source, named: fileName, in: location, remember: false, promise: promise)
          return
        }

        DispatchQueue.main.async {
          self.pickDirectory { directory in
            guard let directory else {
              promise.resolve(false)
              return
            }
            self.fileQueue.async {
              guard directory.startAccessingSecurityScopedResource() else {
                promise.reject("ERR_DOWNLOAD_FOLDER", "No se pudo acceder a la carpeta seleccionada.")
                return
              }
              self.save(source, named: fileName, in: directory, remember: true, promise: promise)
            }
          } onUnavailable: {
            promise.reject("ERR_DOWNLOAD_PICKER", "No se pudo abrir el selector de carpetas.")
          }
        }
      }
    }
  }

  private func savedDirectory() -> URL? {
    guard let bookmark = UserDefaults.standard.data(forKey: bookmarkKey) else {
      return nil
    }
    var isStale = false
    let directory = try? URL(resolvingBookmarkData: bookmark, bookmarkDataIsStale: &isStale)
    return isStale ? nil : directory
  }

  private func pickDirectory(
    onPick: @escaping (URL?) -> Void,
    onUnavailable: () -> Void
  ) {
    guard let presenter = appContext?.utilities?.currentViewController() else {
      onUnavailable()
      return
    }

    let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder], asCopy: false)
    let delegate = DownloadsPickerDelegate { [weak self] url in
      self?.pickerDelegate = nil
      onPick(url)
    }
    pickerDelegate = delegate
    picker.delegate = delegate
    picker.presentationController?.delegate = delegate
    presenter.present(picker, animated: true)
  }

  private func save(
    _ source: URL, named fileName: String, in location: URL, remember: Bool, promise: Promise
  ) {
    defer { location.stopAccessingSecurityScopedResource() }

    let coordinator = NSFileCoordinator()
    var coordinationError: NSError?
    var copyError: Error?
    coordinator.coordinate(writingItemAt: location, options: [], error: &coordinationError) { base in
      do {
        let manager = FileManager.default
        let directory = base.lastPathComponent == folderName
          ? base
          : base.appendingPathComponent(folderName, isDirectory: true)
        try manager.createDirectory(at: directory, withIntermediateDirectories: true)

        let name = fileName as NSString
        let fileExtension = name.pathExtension
        let extensionSuffix = fileExtension.isEmpty ? "" : ".\(fileExtension)"
        let stem = name.deletingPathExtension
        var destination = directory.appendingPathComponent(fileName)
        var suffix = 1

        while manager.fileExists(atPath: destination.path) {
          destination = directory.appendingPathComponent("\(stem) (\(suffix))\(extensionSuffix)")
          suffix += 1
        }
        try manager.copyItem(at: source, to: destination)
      } catch {
        copyError = error
      }
    }

    if let error = copyError ?? coordinationError {
      if (error as NSError).domain == NSCocoaErrorDomain &&
        (error as NSError).code == NSFileWriteNoPermissionError {
        UserDefaults.standard.removeObject(forKey: bookmarkKey)
      }
      promise.reject(error)
      return
    }

    if remember, let bookmark = try? location.bookmarkData(options: .minimalBookmark) {
      UserDefaults.standard.set(bookmark, forKey: bookmarkKey)
    }
    promise.resolve(true)
  }
}

private final class DownloadsPickerDelegate: NSObject, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
  private var completion: ((URL?) -> Void)?

  init(completion: @escaping (URL?) -> Void) {
    self.completion = completion
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    finish(with: urls.first)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    finish(with: nil)
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    finish(with: nil)
  }

  private func finish(with url: URL?) {
    let callback = completion
    completion = nil
    callback?(url)
  }
}
