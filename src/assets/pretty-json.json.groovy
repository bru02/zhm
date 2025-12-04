import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFileFactory
import com.intellij.psi.codeStyle.CodeStyleManager

def result = new StringBuilder()

ROWS.each { row ->
  COLUMNS.each { column ->
    def value = row.value(column)
    def stringValue = FORMATTER.formatValue(value, column)
    result.append(stringValue)
  }
}

CodeStyleManager styleManager = CodeStyleManager.getInstance(PROJECT);
PsiElement psiFile = PsiFileFactory.getInstance(PROJECT).createFileFromText("a.json", result.toString());
styleManager.reformatText(psiFile, [psiFile.getTextRange()]);

OUT.append(psiFile.text)
