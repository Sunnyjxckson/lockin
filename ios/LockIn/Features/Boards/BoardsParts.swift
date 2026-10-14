import SwiftUI
import UIKit
import PhotosUI
import LockInKit

/// A stored board image. The tone shows while it loads and when it cannot.
struct BoardImage: View {
    @Environment(\.liTheme) private var theme
    let url: String?
    var tone: String? = nil

    var body: some View {
        ZStack {
            Rectangle().fill(tone.map { Color(hex: $0) } ?? theme.surface2)
            if let u = url.flatMap({ URL(string: $0) }) {
                AsyncImage(url: u, transaction: Transaction(animation: .easeOut(duration: 0.25))) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        Color.clear
                    }
                }
            }
        }
        .clipped()
    }
}

/// A row of colors, edge to edge.
struct BoardPaletteStrip: View {
    let colors: [String]
    var height: CGFloat = 4

    var body: some View {
        HStack(spacing: 0) {
            ForEach(colors, id: \.self) { c in
                Rectangle().fill(Color(hex: c))
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}

/// The camera, when the device has one.
struct BoardCameraPicker: UIViewControllerRepresentable {
    let onImage: (Data) -> Void
    let onCancel: () -> Void

    static var available: Bool { return UIImagePickerController.isSourceTypeAvailable(.camera) }

    func makeCoordinator() -> Coordinator { return Coordinator(self) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: BoardCameraPicker
        init(_ parent: BoardCameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage, let data = image.jpegData(compressionQuality: 0.9) {
                parent.onImage(data)
            } else {
                parent.onCancel()
            }
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.onCancel()
        }
    }
}

/// Pixels of a stored image, for picking a color off it.
struct BoardPixels {
    var data: [UInt8]
    var width: Int
    var height: Int

    static func load(_ address: String, max side: CGFloat = 640) async -> BoardPixels? {
        guard let url = URL(string: address) else { return nil }
        guard let (data, _) = try? await URLSession.shared.data(from: url) else { return nil }
        guard let image = UIImage(data: data), image.size.width > 0, image.size.height > 0 else { return nil }
        let scale = min(1, side / max(image.size.width, image.size.height))
        let w = max(1, Int((image.size.width * scale).rounded()))
        let h = max(1, Int((image.size.height * scale).rounded()))
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let small = UIGraphicsImageRenderer(size: CGSize(width: w, height: h), format: format).image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
            image.draw(in: CGRect(x: 0, y: 0, width: w, height: h))
        }
        guard let cg = small.cgImage else { return nil }
        var pixels = [UInt8](repeating: 255, count: w * h * 4)
        pixels.withUnsafeMutableBytes { buffer in
            if let ctx = CGContext(data: buffer.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) {
                ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
            }
        }
        return BoardPixels(data: pixels, width: w, height: h)
    }
}

/// A line of text on a swatch, in whichever ink reads best.
func boardInk(_ hex: String) -> Color {
    return Color(hex: BoardsCore.inkOnColor(hex))
}
