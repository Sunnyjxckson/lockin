import SwiftUI
import LockInKit

struct CoachView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ComingSoon(title: "Coach", note: "The coach chat is still on the web app. It is coming here next.")
            .navigationTitle("Coach")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
    }
}
